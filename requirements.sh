# Create a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install transformers accelerate bitsandbytes peft
pip install diffusers[torch] invisible-watermark safetensors
pip install pillow opencv-python
pip install qwen-vl-utils  # For Qwen2.5-VL
