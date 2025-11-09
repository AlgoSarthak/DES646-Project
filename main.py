#!/usr/bin/env python3
"""
Open-Source AI Storyboard Generator
Uses Qwen2.5-VL for script generation and FLUX/SDXL for image generation
with 4-bit quantization and LoRA support
"""

import torch
import json
import base64
from pathlib import Path
from typing import Optional, Dict, List
from PIL import Image
from io import BytesIO

# Transformers for VLM
from transformers import (
    Qwen2VLForConditionalGeneration,
    AutoTokenizer,
    AutoProcessor,
    BitsAndBytesConfig
)

# Diffusers for image generation
from diffusers import (
    FluxPipeline,
    StableDiffusionXLPipeline,
    ControlNetModel,
    StableDiffusionXLControlNetPipeline,
    DPMSolverMultistepScheduler
)
from diffusers.utils import load_image

# PEFT for LoRA
from peft import PeftModel, LoraConfig, get_peft_model


class StoryboardGenerator:
    """Main class for generating storyboards using open-source models"""
    
    def __init__(
        self,
        vlm_model: str = "Qwen/Qwen2.5-VL-7B-Instruct",
        image_model: str = "black-forest-labs/FLUX.1-dev",
        use_controlnet: bool = True,
        quantize_4bit: bool = True,
        device: str = "cuda" if torch.cuda.is_available() else "cpu"
    ):
        """
        Initialize the storyboard generator
        
        Args:
            vlm_model: Vision-Language Model for script generation
            image_model: Text-to-Image model (FLUX or SDXL)
            use_controlnet: Whether to use ControlNet for sketch guidance
            quantize_4bit: Use 4-bit quantization to save memory
            device: Device to run inference on
        """
        self.device = device
        self.quantize_4bit = quantize_4bit
        self.use_controlnet = use_controlnet
        
        print(f"🚀 Initializing models on {device}...")
        
        # Initialize Vision-Language Model for script generation
        self._init_vlm(vlm_model)
        
        # Initialize Image Generation Model
        self._init_image_model(image_model)
        
        print("✅ All models loaded successfully!")
    
    def _init_vlm(self, model_name: str):
        """Initialize Vision-Language Model with quantization"""
        print(f"📥 Loading VLM: {model_name}")
        
        # Configure 4-bit quantization with bitsandbytes
        if self.quantize_4bit:
            bnb_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16,
                bnb_4bit_use_double_quant=True,
            )
            
            self.vlm_model = Qwen2VLForConditionalGeneration.from_pretrained(
                model_name,
                quantization_config=bnb_config,
                device_map="auto",
                torch_dtype=torch.bfloat16,
                trust_remote_code=True
            )
        else:
            self.vlm_model = Qwen2VLForConditionalGeneration.from_pretrained(
                model_name,
                device_map="auto",
                torch_dtype=torch.bfloat16,
                trust_remote_code=True
            )
        
        # Load processor and tokenizer
        self.vlm_processor = AutoProcessor.from_pretrained(
            model_name,
            trust_remote_code=True
        )
        
        print(f"✅ VLM loaded with {'4-bit quantization' if self.quantize_4bit else 'full precision'}")
    
    def _init_image_model(self, model_name: str):
        """Initialize image generation model (FLUX or SDXL)"""
        print(f"📥 Loading Image Model: {model_name}")
        
        if "flux" in model_name.lower():
            # FLUX model
            if self.quantize_4bit:
                # FLUX with quantization
                self.image_pipe = FluxPipeline.from_pretrained(
                    model_name,
                    torch_dtype=torch.bfloat16,
                )
                self.image_pipe.enable_model_cpu_offload()
            else:
                self.image_pipe = FluxPipeline.from_pretrained(
                    model_name,
                    torch_dtype=torch.bfloat16
                ).to(self.device)
            
            # Optional: Load LoRA weights if available
            # self.image_pipe.load_lora_weights("path/to/lora")
            
        else:
            # Stable Diffusion XL with optional ControlNet
            if self.use_controlnet:
                controlnet = ControlNetModel.from_pretrained(
                    "diffusers/controlnet-canny-sdxl-1.0",
                    torch_dtype=torch.float16
                )
                
                self.image_pipe = StableDiffusionXLControlNetPipeline.from_pretrained(
                    model_name,
                    controlnet=controlnet,
                    torch_dtype=torch.float16,
                    variant="fp16",
                    use_safetensors=True
                ).to(self.device)
            else:
                self.image_pipe = StableDiffusionXLPipeline.from_pretrained(
                    model_name,
                    torch_dtype=torch.float16,
                    variant="fp16",
                    use_safetensors=True
                ).to(self.device)
            
            # Optimize with scheduler
            self.image_pipe.scheduler = DPMSolverMultistepScheduler.from_config(
                self.image_pipe.scheduler.config
            )
            
            # Optional: Load LoRA weights
            # self.image_pipe.load_lora_weights("path/to/sdxl_lora")
        
        # Memory optimization
        self.image_pipe.enable_attention_slicing()
        if hasattr(self.image_pipe, 'enable_vae_slicing'):
            self.image_pipe.enable_vae_slicing()
        
        print("✅ Image model loaded")
    
    def generate_storyboard_script(
        self,
        product_concept: str,
        target_audience: str,
        sketch_path: Optional[str] = None
    ) -> List[Dict]:
        """
        Generate storyboard script using Vision-Language Model
        
        Args:
            product_concept: Description of the product
            target_audience: Target audience description
            sketch_path: Optional path to reference sketch image
        
        Returns:
            List of scene dictionaries with script details
        """
        print("\n🎬 Generating storyboard script...")
        
        # Build the prompt
        system_prompt = """You are an expert creative director and storyboard artist.
Generate a compelling product video storyboard with 4-6 scenes.

Return ONLY a valid JSON array with this structure:
[
  {
    "sceneNumber": 1,
    "visualDescription": "Detailed visual description for image generation (2-3 sentences, cinematic)",
    "voiceover": "Engaging narration for the scene (1-2 sentences)",
    "onScreenText": "Optional bold text (or empty string)"
  }
]

Make the storyboard visually dynamic, emotionally engaging, and aligned with the target audience."""
        
        user_prompt = f"""Product Concept: "{product_concept}"
Target Audience: "{target_audience}"

Generate a storyboard that showcases the product's benefits and value proposition."""
        
        # Prepare messages
        messages = [
            {
                "role": "system",
                "content": system_prompt
            }
        ]
        
        # Add sketch image if provided
        if sketch_path:
            user_content = [
                {"type": "text", "text": user_prompt},
                {"type": "text", "text": "Use this sketch as visual inspiration:"},
                {"type": "image", "image": sketch_path}
            ]
        else:
            user_content = [{"type": "text", "text": user_prompt}]
        
        messages.append({
            "role": "user",
            "content": user_content
        })
        
        # Process and generate
        text = self.vlm_processor.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )
        
        inputs = self.vlm_processor(
            text=[text],
            images=[Image.open(sketch_path)] if sketch_path else None,
            padding=True,
            return_tensors="pt"
        ).to(self.device)
        
        # Generate with JSON output
        with torch.no_grad():
            output_ids = self.vlm_model.generate(
                **inputs,
                max_new_tokens=2048,
                do_sample=True,
                temperature=0.7,
                top_p=0.9
            )
        
        output_text = self.vlm_processor.batch_decode(
            output_ids,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False
        )[0]
        
        # Extract JSON from output
        try:
            # Find JSON array in the output
            start_idx = output_text.find('[')
            end_idx = output_text.rfind(']') + 1
            json_str = output_text[start_idx:end_idx]
            scenes = json.loads(json_str)
            
            print(f"✅ Generated {len(scenes)} scenes")
            return scenes
            
        except json.JSONDecodeError as e:
            print(f"❌ Failed to parse JSON: {e}")
            print(f"Raw output: {output_text}")
            raise
    
    def generate_image(
        self,
        prompt: str,
        sketch_image: Optional[Image.Image] = None,
        num_inference_steps: int = 50,
        guidance_scale: float = 7.5,
        width: int = 1024,
        height: int = 1024
    ) -> Image.Image:
        """
        Generate image from text prompt with optional sketch guidance
        
        Args:
            prompt: Text description for image generation
            sketch_image: Optional sketch for ControlNet guidance
            num_inference_steps: Number of denoising steps
            guidance_scale: Classifier-free guidance scale
            width: Output image width
            height: Output image height
        
        Returns:
            Generated PIL Image
        """
        enhanced_prompt = f"Cinematic, professional product video still, high resolution, dynamic lighting, {prompt}"
        
        if isinstance(self.image_pipe, StableDiffusionXLControlNetPipeline) and sketch_image:
            # Use ControlNet with sketch
            from diffusers.utils import make_image_grid
            import cv2
            import numpy as np
            
            # Prepare sketch as control image (Canny edge detection)
            image_array = np.array(sketch_image)
            edges = cv2.Canny(image_array, 100, 200)
            edges = np.stack([edges] * 3, axis=-1)
            control_image = Image.fromarray(edges)
            
            image = self.image_pipe(
                prompt=enhanced_prompt,
                image=control_image,
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                controlnet_conditioning_scale=0.5,
                width=width,
                height=height
            ).images[0]
            
        elif "flux" in str(type(self.image_pipe)).lower():
            # FLUX generation
            image = self.image_pipe(
                prompt=enhanced_prompt,
                height=height,
                width=width,
                guidance_scale=3.5,
                num_inference_steps=num_inference_steps,
                max_sequence_length=512,
                generator=torch.Generator(self.device).manual_seed(42)
            ).images[0]
            
        else:
            # Standard SDXL generation
            image = self.image_pipe(
                prompt=enhanced_prompt,
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                width=width,
                height=height
            ).images[0]
        
        return image
    
    def generate_full_storyboard(
        self,
        product_concept: str,
        target_audience: str,
        sketch_path: Optional[str] = None,
        output_dir: str = "storyboard_output"
    ) -> List[Dict]:
        """
        Generate complete storyboard with script and images
        
        Args:
            product_concept: Product description
            target_audience: Target audience description
            sketch_path: Optional reference sketch
            output_dir: Directory to save outputs
        
        Returns:
            List of scenes with image paths
        """
        output_path = Path(output_dir)
        output_path.mkdir(exist_ok=True)
        
        # Generate script
        scenes = self.generate_storyboard_script(
            product_concept,
            target_audience,
            sketch_path
        )
        
        # Load sketch if provided
        sketch_image = Image.open(sketch_path) if sketch_path else None
        
        # Generate images for each scene
        print("\n🎨 Generating images for each scene...")
        for i, scene in enumerate(scenes):
            print(f"\n  Scene {scene['sceneNumber']}: {scene['visualDescription'][:50]}...")
            
            image = self.generate_image(
                prompt=scene['visualDescription'],
                sketch_image=sketch_image
            )
            
            # Save image
            image_path = output_path / f"scene_{scene['sceneNumber']:02d}.png"
            image.save(image_path)
            scene['imagePath'] = str(image_path)
            
            print(f"  ✅ Saved to {image_path}")
        
        # Save complete storyboard as JSON
        json_path = output_path / "storyboard.json"
        with open(json_path, 'w') as f:
            json.dump(scenes, f, indent=2)
        
        print(f"\n✅ Complete storyboard saved to {output_dir}/")
        return scenes


def main():
    """Example usage"""
    
    # Initialize generator with quantization
    generator = StoryboardGenerator(
        vlm_model="Qwen/Qwen2.5-VL-7B-Instruct",  # Vision-Language Model
        image_model="black-forest-labs/FLUX.1-dev",  # or "stabilityai/stable-diffusion-xl-base-1.0"
        use_controlnet=False,  # Set True for SDXL with sketch control
        quantize_4bit=True  # Use 4-bit quantization to save memory
    )
    
    # Generate storyboard
    scenes = generator.generate_full_storyboard(
        product_concept="A mobile app that uses AI to create personalized bedtime stories for children",
        target_audience="Parents of children aged 4-8 who are looking for engaging, non-screen-time evening activities",
        sketch_path=None,  # Optional: "path/to/sketch.png"
        output_dir="my_storyboard"
    )
    
    # Print results
    print("\n" + "="*60)
    print("STORYBOARD GENERATED")
    print("="*60)
    for scene in scenes:
        print(f"\n🎬 Scene {scene['sceneNumber']}")
        print(f"   Visual: {scene['visualDescription']}")
        print(f"   Voiceover: {scene['voiceover']}")
        if scene.get('onScreenText'):
            print(f"   Text: {scene['onScreenText']}")
        print(f"   Image: {scene['imagePath']}")


if __name__ == "__main__":
    main()
