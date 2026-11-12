"""Compatibility entry point: refresh scores and exact trajectories together."""
import runpy
from pathlib import Path

if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).with_name("refresh_publication.py")), run_name="__main__")
