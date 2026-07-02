"""Shared validation helpers for GTM Skills repository scripts."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Any


class YamlLoadError(ValueError):
    """Raised when YAML cannot be loaded by PyYAML or the fallback parser."""


@dataclass(frozen=True)
class ValidationProblem:
    path: Path
    message: str

    def format(self, root: Path | None = None) -> str:
        path = self.path
        if root is not None:
            try:
                path = path.relative_to(root)
            except ValueError:
                pass
        return f"{path}: {self.message}"


_KEBAB_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def is_kebab_id(value: str) -> bool:
    return bool(_KEBAB_RE.fullmatch(value))


def load_yaml_file(path: Path) -> Any:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise YamlLoadError(f"could not read {path}: {exc}") from exc
    return load_yaml_text(text, path)


def load_yaml_text(text: str, source: Path | str) -> Any:
    try:
        import yaml  # type: ignore
    except ImportError:
        return _parse_subset_yaml(text, str(source))

    try:
        loaded = yaml.safe_load(text)
    except Exception as exc:  # pragma: no cover - exact PyYAML classes vary
        raise YamlLoadError(f"{source}: invalid YAML: {exc}") from exc
    return {} if loaded is None else loaded


@dataclass(frozen=True)
class _Line:
    number: int
    indent: int
    content: str


def _parse_subset_yaml(text: str, source: str) -> Any:
    lines = _prepare_lines(text, source)
    if not lines:
        return {}
    value, index = _parse_block(lines, 0, lines[0].indent, source)
    if index != len(lines):
        line = lines[index]
        raise YamlLoadError(f"{source}:{line.number}: unexpected content")
    return value


def _prepare_lines(text: str, source: str) -> list[_Line]:
    prepared: list[_Line] = []
    for number, raw in enumerate(text.splitlines(), start=1):
        if "\t" in raw[: len(raw) - len(raw.lstrip(" \t"))]:
            raise YamlLoadError(f"{source}:{number}: tabs are not supported")
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped in {"---", "..."}:
            raise YamlLoadError(f"{source}:{number}: multi-document YAML is not supported")
        indent = len(raw) - len(raw.lstrip(" "))
        content = raw[indent:]
        prepared.append(_Line(number=number, indent=indent, content=content))
    return prepared


def _parse_block(lines: list[_Line], index: int, indent: int, source: str) -> tuple[Any, int]:
    if index >= len(lines):
        return {}, index
    line = lines[index]
    if line.indent != indent:
        raise YamlLoadError(f"{source}:{line.number}: expected indentation {indent}, got {line.indent}")
    if line.content.startswith("- "):
        return _parse_list(lines, index, indent, source)
    return _parse_map(lines, index, indent, source)


def _parse_map(lines: list[_Line], index: int, indent: int, source: str) -> tuple[dict[str, Any], int]:
    result: dict[str, Any] = {}
    while index < len(lines):
        line = lines[index]
        if line.indent < indent:
            break
        if line.indent > indent:
            raise YamlLoadError(f"{source}:{line.number}: unexpected indentation")
        if line.content.startswith("- "):
            break
        if ":" not in line.content:
            raise YamlLoadError(f"{source}:{line.number}: expected 'key: value'")

        key, raw_value = line.content.split(":", 1)
        key = key.strip()
        raw_value = raw_value.strip()
        if not key:
            raise YamlLoadError(f"{source}:{line.number}: empty keys are not supported")
        if key in result:
            raise YamlLoadError(f"{source}:{line.number}: duplicate key '{key}'")

        if raw_value in {"|", ">"}:
            result[key], index = _parse_block_scalar(lines, index + 1, line.indent, raw_value == ">")
            continue

        if raw_value == "":
            next_index = index + 1
            if next_index >= len(lines) or lines[next_index].indent <= line.indent:
                result[key] = None
                index = next_index
                continue
            result[key], index = _parse_block(lines, next_index, lines[next_index].indent, source)
            continue

        result[key] = _parse_scalar(raw_value, source, line.number)
        index += 1
    return result, index


def _parse_list(lines: list[_Line], index: int, indent: int, source: str) -> tuple[list[Any], int]:
    result: list[Any] = []
    while index < len(lines):
        line = lines[index]
        if line.indent < indent:
            break
        if line.indent > indent:
            raise YamlLoadError(f"{source}:{line.number}: unexpected indentation")
        if not line.content.startswith("- "):
            break

        raw_value = line.content[2:].strip()
        if raw_value == "":
            next_index = index + 1
            if next_index >= len(lines) or lines[next_index].indent <= line.indent:
                result.append(None)
                index = next_index
                continue
            child, index = _parse_block(lines, next_index, lines[next_index].indent, source)
            result.append(child)
            continue

        if _looks_like_inline_map_item(raw_value):
            key, value = raw_value.split(":", 1)
            result.append({key.strip(): _parse_scalar(value.strip(), source, line.number)})
        else:
            result.append(_parse_scalar(raw_value, source, line.number))
        index += 1
    return result, index


def _parse_block_scalar(
    lines: list[_Line], index: int, parent_indent: int, folded: bool
) -> tuple[str, int]:
    block: list[_Line] = []
    while index < len(lines) and lines[index].indent > parent_indent:
        block.append(lines[index])
        index += 1
    if not block:
        return "", index
    min_indent = min(line.indent for line in block)
    values = [(" " * (line.indent - min_indent)) + line.content for line in block]
    if folded:
        return " ".join(part.strip() for part in values), index
    return "\n".join(values), index


def _parse_scalar(value: str, source: str, line_number: int) -> Any:
    value = value.strip()
    if not value:
        return ""
    if value[0] in {"&", "*", "!"}:
        raise YamlLoadError(f"{source}:{line_number}: anchors, aliases, and tags are not supported")
    if value in {"{}", "{ }"}:
        return {}
    if value in {"[]", "[ ]"}:
        return []
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [_parse_scalar(part, source, line_number) for part in _split_inline_values(inner)]
    if value.startswith("{") and value.endswith("}"):
        return _parse_inline_map(value[1:-1], source, line_number)
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        return value[1:-1]

    lowered = value.lower()
    if lowered in {"true", "false"}:
        return lowered == "true"
    if lowered in {"null", "~"}:
        return None
    if re.fullmatch(r"[-+]?\d+", value):
        return int(value)
    if re.fullmatch(r"[-+]?\d+\.\d+", value):
        return float(value)
    return value


def _split_inline_values(inner: str) -> list[str]:
    values: list[str] = []
    current: list[str] = []
    quote: str | None = None
    depth = 0
    for char in inner:
        if quote:
            current.append(char)
            if char == quote:
                quote = None
            continue
        if char in {"'", '"'}:
            quote = char
            current.append(char)
            continue
        if char in "[{":
            depth += 1
            current.append(char)
            continue
        if char in "]}":
            depth -= 1
            current.append(char)
            continue
        if char == "," and depth == 0:
            values.append("".join(current).strip())
            current = []
            continue
        current.append(char)
    if current:
        values.append("".join(current).strip())
    return values


def _parse_inline_map(inner: str, source: str, line_number: int) -> dict[str, Any]:
    result: dict[str, Any] = {}
    if not inner.strip():
        return result
    for part in _split_inline_values(inner):
        if ":" not in part:
            raise YamlLoadError(f"{source}:{line_number}: expected inline map entry")
        key, value = part.split(":", 1)
        result[key.strip()] = _parse_scalar(value.strip(), source, line_number)
    return result


def _looks_like_inline_map_item(value: str) -> bool:
    if ":" not in value:
        return False
    key, rest = value.split(":", 1)
    return bool(key.strip()) and (not rest or rest.startswith(" "))
