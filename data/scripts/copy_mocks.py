"""
scripts/copy_mocks.py  –  Copy api/mocks/*.json to web/public/mocks/.

Run after generating mocks: python scripts/copy_mocks.py
Never hand-edit web/ directly.

Example: python scripts/copy_mocks.py
"""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "api" / "mocks"
DST = ROOT / "web" / "public" / "mocks"


def copy_mocks() -> None:
    if not SRC.exists():
        print(f"ERROR: Source {SRC} does not exist. Run mock generation first.")
        return

    DST.mkdir(parents=True, exist_ok=True)
    copied = 0
    for src_file in sorted(SRC.glob("*.json")):
        dst_file = DST / src_file.name
        shutil.copy2(src_file, dst_file)
        print(f"  Copied {src_file.name} -> {dst_file}")
        copied += 1

    print(f"\nDone: {copied} mock file(s) copied to {DST}")


if __name__ == "__main__":
    copy_mocks()
