#!/usr/bin/env python3
"""Generate terminal-themed macOS app icon"""
from PIL import Image, ImageDraw, ImageFont
import os
import subprocess

# Icon sizes required for macOS .icns file
ICON_SIZES = [16, 32, 64, 128, 256, 512, 1024]

def create_terminal_icon(size):
    """Create a terminal-themed icon at the specified size"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Colors - modern dark terminal look
    bg_color = (30, 30, 35, 255)  # Dark background
    border_color = (60, 60, 70, 255)  # Slightly lighter border
    prompt_color = (80, 200, 120, 255)  # Green prompt (like terminal)
    cursor_color = (80, 200, 120, 200)  # Blinking cursor

    # Corner radius for rounded rectangle (macOS style)
    radius = size // 6

    # Draw rounded rectangle background
    margin = size // 20
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=radius,
        fill=bg_color,
        outline=border_color,
        width=max(2, size // 64)
    )

    # Draw terminal title bar dots (classic macOS style)
    dot_y = margin + size // 12
    dot_radius = max(3, size // 40)
    dot_spacing = size // 18
    dot_start_x = margin + size // 12

    # Red, yellow, green dots
    draw.ellipse([dot_start_x - dot_radius, dot_y - dot_radius,
                  dot_start_x + dot_radius, dot_y + dot_radius],
                 fill=(255, 95, 86, 255))
    draw.ellipse([dot_start_x + dot_spacing - dot_radius, dot_y - dot_radius,
                  dot_start_x + dot_spacing + dot_radius, dot_y + dot_radius],
                 fill=(255, 189, 46, 255))
    draw.ellipse([dot_start_x + 2 * dot_spacing - dot_radius, dot_y - dot_radius,
                  dot_start_x + 2 * dot_spacing + dot_radius, dot_y + dot_radius],
                 fill=(39, 201, 63, 255))

    # Draw ">_" prompt symbol
    prompt_text = ">_"

    # Calculate font size - make it proportional to icon size
    font_size = size // 3

    # Try to use a monospace font, fall back to default if not available
    try:
        # Try common monospace fonts
        font = None
        for font_name in ['SF Mono', 'Menlo', 'Monaco', 'Courier New', 'DejaVu Sans Mono']:
            try:
                font = ImageFont.truetype(font_name, font_size)
                break
            except:
                continue
        if font is None:
            font = ImageFont.load_default()
    except:
        font = ImageFont.load_default()

    # Get text bounding box for centering
    bbox = draw.textbbox((0, 0), prompt_text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    # Center the text, slightly offset down to account for title bar
    text_x = (size - text_width) // 2
    text_y = (size - text_height) // 2 + size // 20

    # Draw the prompt
    draw.text((text_x, text_y), prompt_text, font=font, fill=prompt_color)

    return img

def generate_iconset():
    """Generate .iconset folder with all required sizes"""
    iconset_path = "TermLife.iconset"
    os.makedirs(iconset_path, exist_ok=True)

    for size in ICON_SIZES:
        # Normal resolution
        img = create_terminal_icon(size)
        img.save(f"{iconset_path}/icon_{size}x{size}.png")

        # Retina (@2x) - only for sizes that make sense
        if size <= 512:
            img_2x = create_terminal_icon(size * 2)
            img_2x.save(f"{iconset_path}/icon_{size}x{size}@2x.png")

        print(f"Generated {size}x{size} icon")

    return iconset_path

def create_icns(iconset_path):
    """Convert .iconset to .icns using iconutil"""
    icns_path = "TermLife.icns"

    # Remove existing .icns if it exists
    if os.path.exists(icns_path):
        os.remove(icns_path)

    # Use iconutil to create .icns file
    try:
        subprocess.run(['iconutil', '-c', 'icns', iconset_path], check=True)
        print(f"Created {icns_path}")

        # Clean up iconset folder
        import shutil
        shutil.rmtree(iconset_path)
        print(f"Cleaned up {iconset_path}")

        return icns_path
    except subprocess.CalledProcessError as e:
        print(f"Error creating .icns: {e}")
        return None
    except FileNotFoundError:
        print("iconutil not found. Keeping .iconset folder.")
        return iconset_path

if __name__ == "__main__":
    print("Generating terminal icon...")
    iconset = generate_iconset()
    result = create_icns(iconset)
    print(f"Done! Result: {result}")
