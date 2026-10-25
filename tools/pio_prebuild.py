# catnet — by cole (github.com/yupthatscole)
"""runs before every platformio build: makes sure secrets.h exists and rebuilds data/ from web/.
"""
import os
import shutil
import sys

Import("env")  # noqa: F821  (provided by PlatformIO/SCons)

PROJECT = env.subst("$PROJECT_DIR")  # noqa: F821
sys.path.insert(0, os.path.join(PROJECT, "tools"))

secrets = os.path.join(PROJECT, "include", "secrets.h")
example = os.path.join(PROJECT, "include", "secrets.example.h")
if not os.path.exists(secrets):
    shutil.copyfile(example, secrets)
    print("*" * 70)
    print("catnet: include/secrets.h was missing, copied secrets.example.h.")
    print("catnet: CHANGE the Wi-Fi password and portal key before deploying!")
    print("*" * 70)

import build_web  # noqa: E402

partition_size = None
try:
    with open(os.path.join(PROJECT, "partitions.csv"), encoding="utf-8") as f:
        for line in f:
            cols = [c.strip() for c in line.split(",")]
            if len(cols) >= 5 and cols[0] == "spiffs":
                partition_size = int(cols[4], 0)
except OSError:
    pass

ok = build_web.build(
    os.path.join(PROJECT, "web"),
    os.path.join(PROJECT, "data"),
    partition_size=partition_size,
    quiet=True,
)
if not ok:
    print("catnet: web build FAILED, see errors above")
    env.Exit(1)  # noqa: F821
