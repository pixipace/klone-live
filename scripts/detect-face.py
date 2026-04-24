#!/usr/bin/env python3
"""
Detect the largest face in an image and print its bounding box as JSON.

Usage: detect-face.py <image-path>
Output: {"x": int, "y": int, "w": int, "h": int, "imgW": int, "imgH": int} or {"detected": false}
"""

import json
import sys


def detect(image_path: str) -> dict:
    try:
        import cv2
    except ImportError:
        return {"detected": False, "error": "opencv-python not installed"}

    img = cv2.imread(image_path)
    if img is None:
        return {"detected": False, "error": "could not read image"}

    h, w = img.shape[:2]

    # Use the bundled Haar cascade. Fast enough for one frame at a time.
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    cascade = cv2.CascadeClassifier(cascade_path)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Try progressively looser params if strict pass finds nothing.
    faces = []
    for scale, neighbors in ((1.1, 3), (1.05, 2)):
        faces = cascade.detectMultiScale(
            gray,
            scaleFactor=scale,
            minNeighbors=neighbors,
            minSize=(40, 40),
        )
        if len(faces) > 0:
            break

    if len(faces) == 0:
        return {"detected": False, "imgW": w, "imgH": h}

    # Pick the largest face (most likely the speaker)
    largest = max(faces, key=lambda f: f[2] * f[3])
    x, y, fw, fh = largest

    return {
        "detected": True,
        "x": int(x),
        "y": int(y),
        "w": int(fw),
        "h": int(fh),
        "imgW": w,
        "imgH": h,
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"detected": False, "error": "usage: detect-face.py <image>"}))
        sys.exit(1)
    print(json.dumps(detect(sys.argv[1])))
