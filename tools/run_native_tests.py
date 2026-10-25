# catnet — by cole (github.com/yupthatscole)
"""builds the firmware logic tests for the pc and runs them.
needs zig as a compiler: pip install ziglang
"""
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    out = os.path.join(tempfile.gettempdir(), "catnet_native_tests" + (".exe" if os.name == "nt" else ""))
    cmd = [sys.executable, "-m", "ziglang", "c++", "-std=c++17", "-O1", "-Wall", "-Wno-unused-function", "-Wno-nullability-completeness",
           "-fsanitize=undefined", "-fno-sanitize-trap=undefined",
           "-I", os.path.join(ROOT, "test", "native", "shim"), "-I", os.path.join(ROOT, "src"),
           os.path.join(ROOT, "test", "native", "test_firmware.cpp"),
           os.path.join(ROOT, "src", "util.cpp"), os.path.join(ROOT, "src", "auth.cpp"),
           "-o", out]
    r = subprocess.run(cmd)
    if r.returncode:
        cmd = [c for c in cmd if not c.startswith("-fsanitize") and not c.startswith("-fno-sanitize")]
        r = subprocess.run(cmd)
        if r.returncode:
            sys.exit("native test build failed")
    sys.exit(subprocess.run([out]).returncode)


if __name__ == "__main__":
    main()
