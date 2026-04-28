#!/usr/bin/env python3
"""
Detect ALL faces in an image with the YuNet DNN detector and print as JSON.

YuNet (cv2.FaceDetectorYN) handles profile shots, tilted heads, sunglasses,
dark skin, kids — all the cases where Haar cascades silently fail. The
caller (face.ts) gets every face found and clusters across multiple frames
to identify the real speaker, so we return a list rather than picking one
face here.

Usage: detect-face.py <image-path>
Output:
  {"detected": true,
   "faces": [{"x": int, "y": int, "w": int, "h": int, "score": float}, ...],
   "imgW": int, "imgH": int}
  or
  {"detected": false, "imgW": int, "imgH": int}
"""

import json
import os
import sys

MODEL_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "models",
    "face_detection_yunet_2023mar.onnx",
)


def detect(image_path: str) -> dict:
    try:
        import cv2
    except ImportError:
        return {"detected": False, "error": "opencv-python not installed"}

    img = cv2.imread(image_path)
    if img is None:
        return {"detected": False, "error": "could not read image"}

    h, w = img.shape[:2]

    if not os.path.exists(MODEL_PATH):
        return {
            "detected": False,
            "error": f"YuNet model missing at {MODEL_PATH}",
            "imgW": w,
            "imgH": h,
        }

    # YuNet's input size MUST match the image dims passed to detect()
    detector = cv2.FaceDetectorYN.create(
        MODEL_PATH,
        "",
        (w, h),
        score_threshold=0.6,
        nms_threshold=0.3,
        top_k=50,
    )
    detector.setInputSize((w, h))
    retval, faces = detector.detect(img)

    if faces is None or len(faces) == 0:
        return {"detected": False, "imgW": w, "imgH": h}

    out = []
    for f in faces:
        # YuNet row layout: [x, y, w, h, ...landmarks..., score]
        x, y, fw, fh = int(f[0]), int(f[1]), int(f[2]), int(f[3])
        score = float(f[-1])
        # Clamp negatives — YuNet sometimes returns slightly negative coords
        # when a face partially leaves frame.
        if fw <= 10 or fh <= 10:
            continue
        x = max(0, x)
        y = max(0, y)
        fw = min(fw, w - x)
        fh = min(fh, h - y)
        out.append({"x": x, "y": y, "w": fw, "h": fh, "score": score})

    if not out:
        return {"detected": False, "imgW": w, "imgH": h}

    return {"detected": True, "faces": out, "imgW": w, "imgH": h}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"detected": False, "error": "usage: detect-face.py <image>"}))
        sys.exit(1)
    print(json.dumps(detect(sys.argv[1])))
