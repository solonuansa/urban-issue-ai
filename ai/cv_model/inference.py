"""
CV Model Inference – loads a trained model and classifies an image.
"""

import os
from PIL import Image

# TODO: import torch and torchvision when model is ready
# import torch
# import torchvision.transforms as transforms

MODEL_CLASSES = ["pothole", "garbage"]
SEVERITY_LEVELS = ["small", "medium", "large"]


def load_model(weights_path: str):
    """
    Load the trained PyTorch model from a .pt weights file.

    Args:
        weights_path: Path to the model weights file.

    Returns:
        Loaded model in eval mode.
    """
    # TODO: implement model loading
    # model = torch.load(weights_path, map_location="cpu")
    # model.eval()
    # return model
    raise NotImplementedError("Model not yet loaded. Place weights in ai/cv_model/weights/")


def preprocess_image(image_path: str):
    """
    Preprocess image for model input.

    Returns:
        Tensor ready for inference.
    """
    # TODO: apply transforms (resize, normalize, etc.)
    image = Image.open(image_path).convert("RGB")
    return image


def run_inference(image_path: str, weights_path: str = None) -> dict:
    """
    Run full inference pipeline on an image.

    Returns:
        {
            "issue_type": str,
            "severity": str,
            "confidence": float
        }
    """
    # TODO: load model, preprocess, run forward pass, decode output

    # Placeholder result
    return {
        "issue_type": "pothole",
        "severity": "medium",
        "confidence": 0.0,
    }
