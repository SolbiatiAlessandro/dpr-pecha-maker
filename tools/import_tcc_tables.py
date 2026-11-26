#!/usr/bin/env python3
"""Print bounded Classic/Chogyal maps from the pinned public tiblegenc.csv.

Source and hash are recorded in NOTICE.md. This only reads the supplied CSV;
review its JSON output before updating src/legacy-table.js.
"""
import csv
import json
import sys


def read_tables(path):
    names = [family + suffix for family in ("TibetanClassic", "TibetanChogyal")
             for suffix in ("", "Skt1", "Skt2", "Skt3", "Skt4")]
    result = {name: {} for name in names}
    with open(path, newline="", encoding="utf-8") as source:
        for row in csv.reader(source):
            if len(row) != 3 or row[0] not in result:
                continue
            name, key, value = row
            code = int(key)
            if not 32 <= code <= 0x10ffff:
                continue
            # Preserve explicit empty slots, but reject error markers and
            # non-Tibetan placeholders rather than guessing their glyphs.
            if value == "༠༠༠༠" or (value != " " and any(not "\u0f00" <= c <= "\u0fff" for c in value)):
                continue
            if len(value) > 32:
                raise ValueError(f"Oversized glyph mapping: {name}:{key}")
            if key in result[name] and result[name][key] != value:
                raise ValueError(f"Conflicting duplicate mapping: {name}:{key}")
            result[name][key] = value
    if any(not entries for entries in result.values()):
        raise ValueError("Missing a requested font map")
    return result


if __name__ == "__main__":
    print(json.dumps(read_tables(sys.argv[1]), ensure_ascii=False, separators=(",", ":")))
