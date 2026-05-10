#!/usr/bin/env python3
"""
Server-side DXF normalization pipeline for Shabeer CAD.

Usage:
    python dxf_parser.py path/to/input.dxf
    python dxf_parser.py path/to/input.dxf -o public/drawing.json

Dependency:
    pip install ezdxf
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable

try:
    import ezdxf
    from ezdxf import recover
    from ezdxf.colors import aci2rgb, int2rgb
except ImportError as exc:
    raise SystemExit(
        "Missing dependency 'ezdxf'. Install it with: pip install ezdxf"
    ) from exc


SKIPPED_ENTITY_TYPES = {
    "WIPEOUT",
    "OLE2FRAME",
    "OLEFRAME",
    "ACAD_PROXY_ENTITY",
    "VIEWPORT",
}

SUPPORTED_ENTITY_TYPES = {
    "LINE",
    "CIRCLE",
    "ARC",
    "LWPOLYLINE",
    "POLYLINE",
    "SPLINE",
    "TEXT",
    "MTEXT",
    "INSERT",
    "HATCH",
    "DIMENSION",
    "ELLIPSE",
    "POINT",
}


@dataclass
class Bounds:
    min_x: float = math.inf
    min_y: float = math.inf
    max_x: float = -math.inf
    max_y: float = -math.inf

    @property
    def is_empty(self) -> bool:
        return not (
            math.isfinite(self.min_x)
            and math.isfinite(self.min_y)
            and math.isfinite(self.max_x)
            and math.isfinite(self.max_y)
        )

    def add_point(self, point: dict[str, float] | None) -> None:
        if point is None:
            return
        x = point.get("x")
        y = point.get("y")
        if x is None or y is None or not math.isfinite(x) or not math.isfinite(y):
            return
        self.min_x = min(self.min_x, x)
        self.min_y = min(self.min_y, y)
        self.max_x = max(self.max_x, x)
        self.max_y = max(self.max_y, y)

    def add_points(self, points: Iterable[dict[str, float]]) -> None:
        for point in points:
            self.add_point(point)

    def merge(self, other: "Bounds") -> None:
        if other.is_empty:
            return
        self.add_point({"x": other.min_x, "y": other.min_y})
        self.add_point({"x": other.max_x, "y": other.max_y})

    def merge_json(self, value: dict[str, Any] | None) -> None:
        if not value:
            return
        self.add_point({"x": value.get("minX"), "y": value.get("minY")})
        self.add_point({"x": value.get("maxX"), "y": value.get("maxY")})

    def to_json(self) -> dict[str, float | bool]:
        if self.is_empty:
            return {
                "minX": 0,
                "minY": 0,
                "maxX": 0,
                "maxY": 0,
                "width": 0,
                "height": 0,
                "isEmpty": True,
            }
        return {
            "minX": self.min_x,
            "minY": self.min_y,
            "maxX": self.max_x,
            "maxY": self.max_y,
            "width": self.max_x - self.min_x,
            "height": self.max_y - self.min_y,
            "isEmpty": False,
        }


class DxfJsonParser:
    def __init__(self, flattening_distance: float = 0.5, max_block_depth: int = 32):
        self.flattening_distance = max(flattening_distance, 0.001)
        self.max_block_depth = max_block_depth
        self.skipped: list[dict[str, Any]] = []
        self.errors: list[dict[str, Any]] = []
        self.breakdown: Counter[str] = Counter()
        self.overall_bounds = Bounds()

    def parse_file(self, input_path: Path, output_path: Path) -> dict[str, Any]:
        doc, recover_messages = self.load_document(input_path)
        layers = self.extract_layers(doc)
        entities: list[dict[str, Any]] = []

        for index, entity in enumerate(doc.modelspace()):
            parsed = self.parse_entity(
                entity,
                source="modelspace",
                fallback_handle=f"MS:{index}",
                block_stack=[],
            )
            if parsed:
                entities.append(parsed)
                self.record_parsed_tree(parsed)
                self.overall_bounds.merge_json(parsed.get("geometry", {}).get("bounds"))

        result = {
            "schemaVersion": "shabeer-cad-drawing-v1",
            "source": str(input_path),
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "layers": layers,
            "entities": entities,
            "skipped": self.skipped,
            "errors": self.errors,
            "bounds": self.overall_bounds.to_json(),
            "summary": {
                "totalParsed": sum(self.breakdown.values()),
                "totalSkipped": len(self.skipped),
                "totalErrors": len(self.errors),
                "entityTypeBreakdown": dict(sorted(self.breakdown.items())),
                "recoverMessages": recover_messages,
            },
        }

        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
        self.print_summary(result)
        return result

    def load_document(self, input_path: Path):
        try:
            doc, auditor = recover.readfile(str(input_path))
            messages = [str(error) for error in auditor.errors]
            return doc, messages
        except Exception:
            doc = ezdxf.readfile(str(input_path))
            return doc, []

    def extract_layers(self, doc) -> list[dict[str, Any]]:
        layers: list[dict[str, Any]] = []
        for layer in doc.layers:
            raw_color_index = int(dxf_get(layer, "color", 7) or 7)
            color_index = abs(raw_color_index)
            true_color = dxf_get(layer, "true_color")
            is_off = bool_method(layer, "is_off", raw_color_index < 0)
            is_frozen = bool_method(layer, "is_frozen", False)
            is_locked = bool_method(layer, "is_locked", False)
            layers.append(
                {
                    "name": str(dxf_get(layer, "name", "0")),
                    "color": build_color(color_index, true_color),
                    "linetype": str(dxf_get(layer, "linetype", "Continuous")),
                    "is_off": is_off,
                    "is_frozen": is_frozen,
                    "is_locked": is_locked,
                    "isOff": is_off,
                    "isFrozen": is_frozen,
                    "isLocked": is_locked,
                }
            )
        return layers

    def parse_entity(
        self,
        entity,
        source: str,
        fallback_handle: str,
        block_stack: list[str],
    ) -> dict[str, Any] | None:
        dxftype = safe_dxftype(entity)
        handle = str(dxf_get(entity, "handle", "") or fallback_handle)

        if dxftype in SKIPPED_ENTITY_TYPES:
            self.log_skipped(entity, handle, source, f"unsupported entity type {dxftype}")
            return None

        if dxftype not in SUPPORTED_ENTITY_TYPES:
            self.log_skipped(entity, handle, source, f"entity type {dxftype} is not normalized")
            return None

        try:
            parser = self.get_entity_parser(dxftype)
            geometry, bounds = parser(entity, handle, source, block_stack)
            geometry["bounds"] = bounds.to_json()
            return {
                "type": dxftype,
                "handle": handle,
                "layer": str(dxf_get(entity, "layer", "0")),
                "color": entity_color(entity),
                "linetype": str(dxf_get(entity, "linetype", "BYLAYER")),
                "lineweight": int(dxf_get(entity, "lineweight", -1) or -1),
                "geometry": geometry,
            }
        except Exception as exc:
            self.errors.append(
                {
                    "type": dxftype,
                    "handle": handle,
                    "layer": str(dxf_get(entity, "layer", "0")),
                    "source": source,
                    "error": f"{exc.__class__.__name__}: {exc}",
                }
            )
            return None

    def get_entity_parser(
        self, dxftype: str
    ) -> Callable[[Any, str, str, list[str]], tuple[dict[str, Any], Bounds]]:
        return {
            "LINE": self.parse_line,
            "CIRCLE": self.parse_circle,
            "ARC": self.parse_arc,
            "LWPOLYLINE": self.parse_lwpolyline,
            "POLYLINE": self.parse_polyline,
            "SPLINE": self.parse_spline,
            "TEXT": self.parse_text,
            "MTEXT": self.parse_mtext,
            "INSERT": self.parse_insert,
            "HATCH": self.parse_hatch,
            "DIMENSION": self.parse_dimension,
            "ELLIPSE": self.parse_ellipse,
            "POINT": self.parse_point,
        }[dxftype]

    def parse_line(self, entity, _handle, _source, _block_stack):
        start = point3(dxf_get(entity, "start"))
        end = point3(dxf_get(entity, "end"))
        bounds = Bounds()
        bounds.add_points([start, end])
        return {"start": start, "end": end}, bounds

    def parse_circle(self, entity, _handle, _source, _block_stack):
        center = point3(dxf_get(entity, "center"))
        radius = float(dxf_get(entity, "radius", 0) or 0)
        bounds = Bounds(
            center["x"] - radius,
            center["y"] - radius,
            center["x"] + radius,
            center["y"] + radius,
        )
        return {"center": center, "radius": radius}, bounds

    def parse_arc(self, entity, _handle, _source, _block_stack):
        center = point3(dxf_get(entity, "center"))
        radius = float(dxf_get(entity, "radius", 0) or 0)
        start_angle = float(dxf_get(entity, "start_angle", 0) or 0)
        end_angle = float(dxf_get(entity, "end_angle", 0) or 0)
        points = sample_arc_degrees(center, radius, start_angle, end_angle, True)
        bounds = Bounds()
        bounds.add_points(points)
        return {
            "center": center,
            "radius": radius,
            "startAngle": start_angle,
            "endAngle": end_angle,
            "sampledPoints": points,
        }, bounds

    def parse_lwpolyline(self, entity, _handle, _source, _block_stack):
        elevation = float(dxf_get(entity, "elevation", 0) or 0)
        closed = bool(getattr(entity, "closed", False))
        vertices = []
        for raw in entity.get_points("xyseb"):
            x, y, start_width, end_width, bulge = raw
            vertices.append(
                {
                    "x": float(x),
                    "y": float(y),
                    "z": elevation,
                    "startWidth": float(start_width or 0),
                    "endWidth": float(end_width or 0),
                    "bulge": float(bulge or 0),
                }
            )
        points = sample_bulged_polyline(vertices, closed)
        bounds = Bounds()
        bounds.add_points(points)
        return {"closed": closed, "vertices": vertices, "points": points}, bounds

    def parse_polyline(self, entity, _handle, _source, _block_stack):
        closed_attr = getattr(entity, "is_closed", False)
        closed = bool(closed_attr() if callable(closed_attr) else closed_attr)
        vertices = []
        for vertex in list_attr(entity, "vertices"):
            location = point3(dxf_get(vertex, "location"))
            vertices.append(
                {
                    **location,
                    "startWidth": float(dxf_get(vertex, "start_width", 0) or 0),
                    "endWidth": float(dxf_get(vertex, "end_width", 0) or 0),
                    "bulge": float(dxf_get(vertex, "bulge", 0) or 0),
                }
            )
        points = sample_bulged_polyline(vertices, closed)
        bounds = Bounds()
        bounds.add_points(points)
        return {"closed": closed, "vertices": vertices, "points": points}, bounds

    def parse_spline(self, entity, _handle, _source, _block_stack):
        control_points = [point3(point) for point in list_attr(entity, "control_points")]
        fit_points = [point3(point) for point in list_attr(entity, "fit_points")]
        knots = [float(value) for value in list_attr(entity, "knots")]
        weights = [float(value) for value in list_attr(entity, "weights")]
        sampled_points = self.sample_curve(entity)
        if not sampled_points:
            sampled_points = fit_points or control_points
        bounds = Bounds()
        bounds.add_points(sampled_points)
        return {
            "degree": int(dxf_get(entity, "degree", getattr(entity, "degree", 3)) or 3),
            "controlPoints": control_points,
            "fitPoints": fit_points,
            "knots": knots,
            "weights": weights,
            "sampledPoints": sampled_points,
        }, bounds

    def parse_text(self, entity, _handle, _source, _block_stack):
        insert = point3(dxf_get(entity, "insert"))
        align_point = point3_or_none(dxf_get(entity, "align_point", None))
        bounds = Bounds()
        bounds.add_point(insert)
        bounds.add_point(align_point)
        return {
            "text": str(dxf_get(entity, "text", "")),
            "insert": insert,
            "alignPoint": align_point,
            "height": float(dxf_get(entity, "height", 1) or 1),
            "rotation": float(dxf_get(entity, "rotation", 0) or 0),
            "style": str(dxf_get(entity, "style", "Standard")),
            "horizontalAlign": int(dxf_get(entity, "halign", 0) or 0),
            "verticalAlign": int(dxf_get(entity, "valign", 0) or 0),
        }, bounds

    def parse_mtext(self, entity, _handle, _source, _block_stack):
        insert = point3(dxf_get(entity, "insert"))
        text = entity.plain_text() if hasattr(entity, "plain_text") else str(entity.text)
        bounds = Bounds()
        bounds.add_point(insert)
        return {
            "text": text,
            "rawText": str(getattr(entity, "text", text)),
            "insert": insert,
            "charHeight": float(dxf_get(entity, "char_height", 1) or 1),
            "width": float(dxf_get(entity, "width", 0) or 0),
            "rotation": float(dxf_get(entity, "rotation", 0) or 0),
            "attachmentPoint": int(dxf_get(entity, "attachment_point", 1) or 1),
            "style": str(dxf_get(entity, "style", "Standard")),
        }, bounds

    def parse_insert(self, entity, handle, source, block_stack):
        block_name = str(dxf_get(entity, "name", ""))
        insert = point3(dxf_get(entity, "insert"))
        bounds = Bounds()
        bounds.add_point(insert)
        children: list[dict[str, Any]] = []
        child_source = f"{source}/INSERT:{handle}:{block_name}"

        if block_name in block_stack or len(block_stack) >= self.max_block_depth:
            self.log_skipped(entity, handle, source, f"block recursion stopped for {block_name}")
        else:
            try:
                for index, child in enumerate(entity.virtual_entities()):
                    child_handle = str(
                        dxf_get(child, "handle", "")
                        or f"{handle}:VIRTUAL:{index}:{safe_dxftype(child)}"
                    )
                    parsed = self.parse_entity(
                        child,
                        source=child_source,
                        fallback_handle=child_handle,
                        block_stack=[*block_stack, block_name],
                    )
                    if parsed:
                        children.append(parsed)
                        bounds.merge_json(parsed.get("geometry", {}).get("bounds"))
            except Exception as exc:
                self.errors.append(
                    {
                        "type": "INSERT",
                        "handle": handle,
                        "layer": str(dxf_get(entity, "layer", "0")),
                        "source": source,
                        "error": f"virtual_entities failed: {exc.__class__.__name__}: {exc}",
                    }
                )

        attributes = []
        for attrib in list_attr(entity, "attribs"):
            attributes.append(
                {
                    "tag": str(dxf_get(attrib, "tag", "")),
                    "text": str(dxf_get(attrib, "text", "")),
                    "insert": point3(dxf_get(attrib, "insert")),
                    "height": float(dxf_get(attrib, "height", 1) or 1),
                    "rotation": float(dxf_get(attrib, "rotation", 0) or 0),
                }
            )

        return {
            "blockName": block_name,
            "insert": insert,
            "scale": {
                "x": float(dxf_get(entity, "xscale", 1) or 1),
                "y": float(dxf_get(entity, "yscale", 1) or 1),
                "z": float(dxf_get(entity, "zscale", 1) or 1),
            },
            "rotation": float(dxf_get(entity, "rotation", 0) or 0),
            "rowCount": int(dxf_get(entity, "row_count", 1) or 1),
            "columnCount": int(dxf_get(entity, "column_count", 1) or 1),
            "rowSpacing": float(dxf_get(entity, "row_spacing", 0) or 0),
            "columnSpacing": float(dxf_get(entity, "column_spacing", 0) or 0),
            "attributes": attributes,
            "children": children,
        }, bounds

    def parse_hatch(self, entity, _handle, _source, _block_stack):
        paths = []
        bounds = Bounds()
        for path_index, path in enumerate(getattr(entity, "paths", [])):
            parsed_path, points = self.parse_hatch_path(path, path_index)
            paths.append(parsed_path)
            bounds.add_points(points)
        return {
            "solidFill": bool(getattr(entity, "solid_fill", False)),
            "patternName": str(dxf_get(entity, "pattern_name", "SOLID")),
            "patternScale": float(dxf_get(entity, "pattern_scale", 1) or 1),
            "patternAngle": float(dxf_get(entity, "pattern_angle", 0) or 0),
            "associative": bool(dxf_get(entity, "associative", 0)),
            "paths": paths,
        }, bounds

    def parse_dimension(self, entity, handle, source, block_stack):
        bounds = Bounds()
        definition_points = []
        for name in ("defpoint", "defpoint2", "defpoint3", "defpoint4", "defpoint5"):
            point = point3_or_none(dxf_get(entity, name, None))
            if point:
                definition_points.append({"name": name, "point": point})
                bounds.add_point(point)

        children: list[dict[str, Any]] = []
        try:
            for index, child in enumerate(entity.virtual_entities()):
                child_handle = str(dxf_get(child, "handle", "") or f"{handle}:DIM:{index}:{safe_dxftype(child)}")
                parsed = self.parse_entity(
                    child,
                    source=f"{source}/DIMENSION:{handle}",
                    fallback_handle=child_handle,
                    block_stack=block_stack,
                )
                if parsed:
                    children.append(parsed)
                    bounds.merge_json(parsed.get("geometry", {}).get("bounds"))
        except Exception as exc:
            self.errors.append(
                {
                    "type": "DIMENSION",
                    "handle": handle,
                    "layer": str(dxf_get(entity, "layer", "0")),
                    "source": source,
                    "error": f"virtual_entities failed: {exc.__class__.__name__}: {exc}",
                }
            )

        return {
            "dimensionType": int(dxf_get(entity, "dimtype", 0) or 0),
            "text": str(dxf_get(entity, "text", "")),
            "definitionPoints": definition_points,
            "children": children,
        }, bounds

    def parse_ellipse(self, entity, _handle, _source, _block_stack):
        center = point3(dxf_get(entity, "center"))
        major_axis = point3(dxf_get(entity, "major_axis"))
        ratio = float(dxf_get(entity, "ratio", 1) or 1)
        start_param = float(dxf_get(entity, "start_param", 0) or 0)
        end_param = float(dxf_get(entity, "end_param", math.tau) or math.tau)
        points = sample_ellipse(center, major_axis, ratio, start_param, end_param)
        bounds = Bounds()
        bounds.add_points(points)
        return {
            "center": center,
            "majorAxis": major_axis,
            "ratio": ratio,
            "startParam": start_param,
            "endParam": end_param,
            "sampledPoints": points,
        }, bounds

    def parse_point(self, entity, _handle, _source, _block_stack):
        location = point3(dxf_get(entity, "location"))
        bounds = Bounds()
        bounds.add_point(location)
        return {"location": location}, bounds

    def parse_hatch_path(self, path, path_index: int) -> tuple[dict[str, Any], list[dict[str, float]]]:
        if hasattr(path, "vertices"):
            vertices = []
            for raw in getattr(path, "vertices", []):
                vertices.append(polyline_vertex_from_raw(raw))
            closed = bool(getattr(path, "is_closed", True))
            sampled = sample_bulged_polyline(vertices, closed)
            return {
                "type": "polyline",
                "index": path_index,
                "closed": closed,
                "vertices": vertices,
                "points": sampled,
            }, sampled

        edges = []
        sampled_points: list[dict[str, float]] = []
        for edge_index, edge in enumerate(getattr(path, "edges", [])):
            parsed_edge, points = self.parse_hatch_edge(edge, edge_index)
            edges.append(parsed_edge)
            sampled_points.extend(points)
        return {"type": "edges", "index": path_index, "edges": edges}, sampled_points

    def parse_hatch_edge(self, edge, edge_index: int) -> tuple[dict[str, Any], list[dict[str, float]]]:
        edge_name = edge.__class__.__name__

        if hasattr(edge, "start") and hasattr(edge, "end"):
            start = point2(getattr(edge, "start"))
            end = point2(getattr(edge, "end"))
            return {"type": "line", "index": edge_index, "start": start, "end": end}, [start, end]

        if hasattr(edge, "center") and hasattr(edge, "radius"):
            center = point2(getattr(edge, "center"))
            radius = float(getattr(edge, "radius", 0) or 0)
            start_angle = float(getattr(edge, "start_angle", 0) or 0)
            end_angle = float(getattr(edge, "end_angle", 360) or 360)
            ccw = bool(getattr(edge, "ccw", True))
            points = sample_arc_degrees(center, radius, start_angle, end_angle, ccw)
            return {
                "type": "arc",
                "index": edge_index,
                "center": center,
                "radius": radius,
                "startAngle": start_angle,
                "endAngle": end_angle,
                "ccw": ccw,
                "sampledPoints": points,
            }, points

        if hasattr(edge, "major_axis") and hasattr(edge, "ratio"):
            center = point2(getattr(edge, "center"))
            major_axis = point2(getattr(edge, "major_axis"))
            ratio = float(getattr(edge, "ratio", 1) or 1)
            start_angle = math.radians(float(getattr(edge, "start_angle", 0) or 0))
            end_angle = math.radians(float(getattr(edge, "end_angle", 360) or 360))
            ccw = bool(getattr(edge, "ccw", True))
            points = sample_ellipse(center, major_axis, ratio, start_angle, end_angle, ccw)
            return {
                "type": "ellipse",
                "index": edge_index,
                "center": center,
                "majorAxis": major_axis,
                "ratio": ratio,
                "startAngle": math.degrees(start_angle),
                "endAngle": math.degrees(end_angle),
                "ccw": ccw,
                "sampledPoints": points,
            }, points

        if "Spline" in edge_name or hasattr(edge, "control_points"):
            control_points = [point2(point) for point in list_attr(edge, "control_points")]
            fit_points = [point2(point) for point in list_attr(edge, "fit_points")]
            sampled = fit_points or control_points
            return {
                "type": "spline",
                "index": edge_index,
                "degree": int(getattr(edge, "degree", 3) or 3),
                "controlPoints": control_points,
                "fitPoints": fit_points,
                "sampledPoints": sampled,
            }, sampled

        return {"type": "unknown", "index": edge_index, "edgeClass": edge_name}, []

    def sample_curve(self, entity) -> list[dict[str, float]]:
        for sampler in (
            lambda: entity.flattening(self.flattening_distance),
            lambda: entity.flattening(distance=self.flattening_distance),
            lambda: entity.approximate(128),
        ):
            try:
                return [point3(point) for point in sampler()]
            except Exception:
                continue
        return []

    def record_parsed_tree(self, entity: dict[str, Any]) -> None:
        self.breakdown[entity["type"]] += 1
        for child in entity.get("geometry", {}).get("children", []):
            self.record_parsed_tree(child)

    def log_skipped(self, entity, handle: str, source: str, reason: str) -> None:
        self.skipped.append(
            {
                "type": safe_dxftype(entity),
                "handle": handle,
                "layer": str(dxf_get(entity, "layer", "0")),
                "source": source,
                "reason": reason,
            }
        )

    def print_summary(self, result: dict[str, Any]) -> None:
        summary = result["summary"]
        print("DXF parse complete")
        print(f"  parsed:  {summary['totalParsed']}")
        print(f"  skipped: {summary['totalSkipped']}")
        print(f"  errors:  {summary['totalErrors']}")
        print("  breakdown:")
        for entity_type, count in summary["entityTypeBreakdown"].items():
            print(f"    {entity_type}: {count}")
        bounds = result["bounds"]
        print(
            "  bounds: "
            f"min=({bounds['minX']}, {bounds['minY']}) "
            f"max=({bounds['maxX']}, {bounds['maxY']}) "
            f"size=({bounds['width']} x {bounds['height']})"
        )


def dxf_get(entity, name: str, default: Any = None) -> Any:
    try:
        return entity.dxf.get(name, default)
    except Exception:
        return getattr(getattr(entity, "dxf", object()), name, default)


def safe_dxftype(entity) -> str:
    try:
        return str(entity.dxftype()).upper()
    except Exception:
        return str(entity.__class__.__name__).upper()


def bool_method(obj, name: str, fallback: bool) -> bool:
    try:
        value = getattr(obj, name)
        return bool(value() if callable(value) else value)
    except Exception:
        return fallback


def list_attr(obj, name: str) -> list[Any]:
    try:
        value = getattr(obj, name, [])
        value = value() if callable(value) else value
        return list(value or [])
    except Exception:
        return []


def point2(value: Any) -> dict[str, float]:
    if value is None:
        return {"x": 0.0, "y": 0.0}
    if hasattr(value, "x") and hasattr(value, "y"):
        return {"x": float(value.x), "y": float(value.y)}
    values = list(value)
    return {"x": float(values[0]), "y": float(values[1])}


def point3(value: Any) -> dict[str, float]:
    if value is None:
        return {"x": 0.0, "y": 0.0, "z": 0.0}
    if hasattr(value, "x") and hasattr(value, "y"):
        x = float(value.x)
        y = float(value.y)
        z = float(getattr(value, "z", 0.0) or 0.0)
        return {"x": x, "y": y, "z": z}
    values = list(value)
    x = float(values[0])
    y = float(values[1])
    z = float(values[2]) if len(values) > 2 else 0.0
    return {"x": x, "y": y, "z": z}


def point3_or_none(value: Any) -> dict[str, float] | None:
    if value is None:
        return None
    try:
        return point3(value)
    except Exception:
        return None


def polyline_vertex_from_raw(raw: Any) -> dict[str, float]:
    if hasattr(raw, "x"):
        return {
            "x": float(raw.x),
            "y": float(raw.y),
            "z": float(getattr(raw, "z", 0) or 0),
            "bulge": float(getattr(raw, "bulge", 0) or 0),
        }
    values = list(raw)
    return {
        "x": float(values[0]),
        "y": float(values[1]),
        "z": float(values[2]) if len(values) > 3 else 0.0,
        "bulge": float(values[-1]) if len(values) >= 3 else 0.0,
    }


def build_color(aci: int | None, true_color: int | None = None) -> dict[str, Any]:
    if true_color is not None:
        rgb = rgb_to_hex(int2rgb(int(true_color)))
        return {"mode": "truecolor", "aci": aci, "trueColor": int(true_color), "rgb": rgb}
    if aci == 256:
        return {"mode": "bylayer", "aci": 256, "trueColor": None, "rgb": None}
    if aci == 0:
        return {"mode": "byblock", "aci": 0, "trueColor": None, "rgb": None}
    try:
        return {"mode": "aci", "aci": int(aci or 7), "trueColor": None, "rgb": rgb_to_hex(aci2rgb(int(aci or 7)))}
    except Exception:
        return {"mode": "aci", "aci": int(aci or 7), "trueColor": None, "rgb": "#ffffff"}


def entity_color(entity) -> dict[str, Any]:
    aci = int(dxf_get(entity, "color", 256) or 256)
    true_color = dxf_get(entity, "true_color", None)
    return build_color(aci, true_color)


def rgb_to_hex(rgb: Any) -> str:
    if hasattr(rgb, "r") and hasattr(rgb, "g") and hasattr(rgb, "b"):
        r = int(rgb.r)
        g = int(rgb.g)
        b = int(rgb.b)
    else:
        values = list(rgb)
        r = int(values[0])
        g = int(values[1])
        b = int(values[2])
    return f"#{r:02x}{g:02x}{b:02x}"


def sample_arc_degrees(
    center: dict[str, float],
    radius: float,
    start_angle: float,
    end_angle: float,
    ccw: bool = True,
    segments: int = 96,
) -> list[dict[str, float]]:
    start = math.radians(start_angle)
    end = math.radians(end_angle)
    return sample_arc_radians(center, radius, start, end, ccw, segments)


def sample_arc_radians(
    center: dict[str, float],
    radius: float,
    start: float,
    end: float,
    ccw: bool = True,
    segments: int = 96,
) -> list[dict[str, float]]:
    if radius <= 0:
        return [center]
    sweep = normalize_sweep(start, end, ccw)
    count = max(8, min(segments, int(abs(sweep) / (math.tau / 96)) + 2))
    points = []
    for index in range(count + 1):
        angle = start + sweep * (index / count)
        points.append(
            {
                "x": center["x"] + math.cos(angle) * radius,
                "y": center["y"] + math.sin(angle) * radius,
                "z": center.get("z", 0.0),
            }
        )
    return points


def sample_ellipse(
    center: dict[str, float],
    major_axis: dict[str, float],
    ratio: float,
    start_param: float,
    end_param: float,
    ccw: bool = True,
    segments: int = 128,
) -> list[dict[str, float]]:
    sweep = normalize_sweep(start_param, end_param, ccw)
    major_x = major_axis["x"]
    major_y = major_axis["y"]
    minor_x = -major_y * ratio
    minor_y = major_x * ratio
    count = max(16, min(segments, int(abs(sweep) / (math.tau / 128)) + 2))
    points = []
    for index in range(count + 1):
        angle = start_param + sweep * (index / count)
        points.append(
            {
                "x": center["x"] + major_x * math.cos(angle) + minor_x * math.sin(angle),
                "y": center["y"] + major_y * math.cos(angle) + minor_y * math.sin(angle),
                "z": center.get("z", 0.0),
            }
        )
    return points


def normalize_sweep(start: float, end: float, ccw: bool) -> float:
    sweep = end - start
    if ccw:
        while sweep <= 0:
            sweep += math.tau
    else:
        while sweep >= 0:
            sweep -= math.tau
    return sweep


def sample_bulged_polyline(vertices: list[dict[str, float]], closed: bool) -> list[dict[str, float]]:
    if not vertices:
        return []
    if len(vertices) == 1:
        return [vertices[0]]

    sampled: list[dict[str, float]] = []
    segment_count = len(vertices) if closed else len(vertices) - 1
    for index in range(segment_count):
        start = vertices[index]
        end = vertices[(index + 1) % len(vertices)]
        bulge = float(start.get("bulge", 0) or 0)
        segment = sample_bulge_segment(start, end, bulge)
        if sampled and segment:
            segment = segment[1:]
        sampled.extend(segment)
    return sampled


def sample_bulge_segment(
    start: dict[str, float],
    end: dict[str, float],
    bulge: float,
    max_step_degrees: float = 5.0,
) -> list[dict[str, float]]:
    if abs(bulge) < 1e-12:
        return [start, end]

    x1, y1 = start["x"], start["y"]
    x2, y2 = end["x"], end["y"]
    dx = x2 - x1
    dy = y2 - y1
    chord = math.hypot(dx, dy)
    if chord <= 1e-12:
        return [start, end]

    theta = 4.0 * math.atan(bulge)
    radius = chord * (1.0 + bulge * bulge) / (4.0 * abs(bulge))
    mid_x = (x1 + x2) / 2.0
    mid_y = (y1 + y2) / 2.0
    perp_x = -dy / chord
    perp_y = dx / chord
    center_offset = chord * (1.0 - bulge * bulge) / (4.0 * bulge)
    center = {"x": mid_x + perp_x * center_offset, "y": mid_y + perp_y * center_offset, "z": start.get("z", 0.0)}

    start_angle = math.atan2(y1 - center["y"], x1 - center["x"])
    count = max(4, int(abs(math.degrees(theta)) / max_step_degrees) + 1)
    points = []
    for index in range(count + 1):
        angle = start_angle + theta * (index / count)
        points.append(
            {
                "x": center["x"] + math.cos(angle) * radius,
                "y": center["y"] + math.sin(angle) * radius,
                "z": start.get("z", 0.0),
            }
        )
    return points


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Normalize a DXF file into drawing.json")
    parser.add_argument("input", type=Path, help="Path to the DXF file")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("drawing.json"),
        help="Output JSON path, default: drawing.json",
    )
    parser.add_argument(
        "--flattening-distance",
        type=float,
        default=0.5,
        help="Curve flattening distance used for splines, default: 0.5",
    )
    parser.add_argument(
        "--max-block-depth",
        type=int,
        default=32,
        help="Maximum recursive INSERT expansion depth, default: 32",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.input.exists():
        print(f"DXF file not found: {args.input}", file=sys.stderr)
        return 2
    parser = DxfJsonParser(
        flattening_distance=args.flattening_distance,
        max_block_depth=args.max_block_depth,
    )
    parser.parse_file(args.input, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
