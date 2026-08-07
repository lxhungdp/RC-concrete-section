"""Build the deterministic Unicode fallback font used by the browser PDF writer.

The source is the official Noto Sans KR variable TTF. The output is a renamed, static 400-weight
subset covering Latin, Vietnamese, Greek, engineering symbols, and modern Korean. FontTools is a
maintenance-time dependency only; the generated TTF is what the web application serves.
"""

from pathlib import Path
import argparse

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


UNICODE_RANGES = (
    "U+0000-024F,U+0370-03FF,U+1100-11FF,U+1E00-1EFF,U+2000-206F,"
    "U+2070-209F,U+20A0-20CF,U+2100-214F,U+2190-22FF,U+2200-22FF,"
    "U+2460-24FF,U+3000-303F,U+3130-318F,U+AC00-D7AF"
)


def rename_font(font: TTFont) -> None:
    names = {
        1: "PM Report Unicode",
        2: "Regular",
        3: "PM Report Unicode Regular 1.0",
        4: "PM Report Unicode Regular",
        6: "PMReportUnicode-Regular",
        16: "PM Report Unicode",
        17: "Regular",
    }
    table = font["name"]
    for name_id, value in names.items():
        table.setName(value, name_id, 3, 1, 0x409)
        table.setName(value, name_id, 1, 0, 0)


def build(source: Path, output: Path) -> None:
    font = TTFont(source)
    if "fvar" in font:
        font = instantiateVariableFont(font, {"wght": 400}, inplace=False)

    options = subset.Options()
    options.layout_features = ["*"]
    options.glyph_names = True
    options.symbol_cmap = True
    options.legacy_cmap = True
    options.notdef_glyph = True
    options.notdef_outline = True
    options.recommended_glyphs = True
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.name_languages = ["*"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=subset.parse_unicodes(UNICODE_RANGES))
    subsetter.subset(font)
    rename_font(font)

    output.parent.mkdir(parents=True, exist_ok=True)
    font.save(output, reorderTables=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.source, args.output)


if __name__ == "__main__":
    main()
