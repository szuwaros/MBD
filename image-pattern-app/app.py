import io
import base64
import json
import numpy as np
import cv2
from flask import Flask, request, jsonify, send_from_directory
from PIL import Image

app = Flask(__name__, static_folder="static")


def decode_image(file_storage):
    img_bytes = file_storage.read()
    img_array = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    return img


def encode_image_base64(img):
    _, buffer = cv2.imencode(".png", img)
    return base64.b64encode(buffer).decode("utf-8")


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/api/match", methods=["POST"])
def match_template():
    if "template" not in request.files or "target" not in request.files:
        return jsonify({"error": "Brak plików: 'template' i 'target'"}), 400

    template_file = request.files["template"]
    target_file = request.files["target"]
    threshold = float(request.form.get("threshold", 0.7))
    method_name = request.form.get("method", "TM_CCOEFF_NORMED")

    methods = {
        "TM_CCOEFF_NORMED": cv2.TM_CCOEFF_NORMED,
        "TM_CCORR_NORMED": cv2.TM_CCORR_NORMED,
        "TM_SQDIFF_NORMED": cv2.TM_SQDIFF_NORMED,
    }
    method = methods.get(method_name, cv2.TM_CCOEFF_NORMED)
    use_sqdiff = method_name == "TM_SQDIFF_NORMED"

    tmpl = decode_image(template_file)
    target = decode_image(target_file)

    if tmpl is None or target is None:
        return jsonify({"error": "Nie można odczytać obrazów"}), 400

    th, tw = tmpl.shape[:2]
    th_target, tw_target = target.shape[:2]

    if th > th_target or tw > tw_target:
        return jsonify({"error": "Wzorzec jest większy niż obraz docelowy"}), 400

    result = cv2.matchTemplate(target, tmpl, method)

    if use_sqdiff:
        locations = np.where(result <= (1.0 - threshold))
    else:
        locations = np.where(result >= threshold)

    matches = []
    for pt in zip(*locations[::-1]):
        score = float(result[pt[1], pt[0]])
        matches.append({"x": int(pt[0]), "y": int(pt[1]), "score": score})

    # Non-maximum suppression
    matches = nms(matches, tw, th, overlap=0.5)

    # Draw rectangles on result image
    output = target.copy()
    for m in matches:
        x, y = m["x"], m["y"]
        cv2.rectangle(output, (x, y), (x + tw, y + th), (0, 255, 0), 2)
        label = f"{m['score']:.2f}"
        cv2.putText(output, label, (x, y - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

    result_b64 = encode_image_base64(output)
    tmpl_b64 = encode_image_base64(tmpl)

    # Score map normalized to 0-255
    if use_sqdiff:
        score_map = 1.0 - cv2.normalize(result, None, 0, 1, cv2.NORM_MINMAX)
    else:
        score_map = cv2.normalize(result, None, 0, 1, cv2.NORM_MINMAX)

    score_map_color = cv2.applyColorMap(
        (score_map * 255).astype(np.uint8), cv2.COLORMAP_JET
    )
    score_b64 = encode_image_base64(score_map_color)

    return jsonify({
        "matches": matches,
        "count": len(matches),
        "result_image": result_b64,
        "score_map": score_b64,
        "template_size": {"w": tw, "h": th},
        "target_size": {"w": tw_target, "h": th_target},
    })


def nms(matches, w, h, overlap=0.5):
    if not matches:
        return []

    boxes = np.array([[m["x"], m["y"], m["x"] + w, m["y"] + h] for m in matches], dtype=float)
    scores = np.array([m["score"] for m in matches])

    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]

    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        iou = inter / (areas[i] + areas[order[1:]] - inter)
        order = order[1:][iou <= overlap]

    return [matches[k] for k in keep]


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050, debug=False)
