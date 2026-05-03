"""
Lightweight GPU/CPU inference for interview proctoring: COCO cellphone detection via YOLOv8n.
Send a single JPEG snapshot (no video streams). Confidence threshold enforced in code + optional query param.
"""
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO

app = FastAPI(title="IntelliPlace Proctoring Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazily load model once (downloads yolov8n.pt from Ultralytics hub on first use if missing)
_model: Optional[YOLO] = None

# COCO class name for cellphone (Ultralytics COCO YAML)
_CELL_PHONE_NAMES = frozenset({"cell phone", "mobile phone"})


def get_model() -> YOLO:
    global _model
    if _model is None:
        _model = YOLO("yolov8n.pt")
    return _model


@app.get("/health")
def health():
    return {"status": "ok", "service": "proctoring"}


@app.post("/phone-detect")
async def phone_detect(
    file: UploadFile = File(None),
    min_confidence: float = 0.6,
):
    """
    Accept multipart JPEG/PNG snapshot. Returns whether a cell phone (COCO) was detected above confidence.
    """
    if min_confidence < 0.1 or min_confidence > 0.99:
        raise HTTPException(400, detail="min_confidence must be between 0.1 and 0.99")

    if file is None or not file.filename:
        raise HTTPException(400, detail="Missing image file")

    raw = await file.read()
    if not raw:
        raise HTTPException(400, detail="Empty file")

    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, detail="Could not decode image")

    model = get_model()
    results = model.predict(img, verbose=False)
    phones = []

    if results:
        r0 = results[0]
        if r0.boxes is not None and len(r0.boxes):
            names = getattr(model, "names", None) or {}
            for b in r0.boxes:
                cid = int(b.cls[0].item())
                label = str(names.get(cid, "") or "").lower().strip()
                conf = float(b.conf[0].item())
                if conf < min_confidence:
                    continue
                if label in _CELL_PHONE_NAMES or (
                    "cell" in label and "phone" in label
                ):
                    phones.append({"label": label, "confidence": conf})

    max_conf = max((p["confidence"] for p in phones), default=0)
    violated = len(phones) > 0
    return {
        "phone_detected": violated,
        "max_confidence": max_conf,
        "detections": phones[:8],
    }
