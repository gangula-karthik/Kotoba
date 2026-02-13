#!/usr/bin/env python3
"""Generate DMG background image for Koto installer.
Uses only Python3 standard library (struct, zlib) to create a valid PNG.
Run: python3 scripts/create-dmg-background.py
"""
import struct
import zlib
import os
import math

WIDTH = 660
HEIGHT = 400


def create_png(width, height, pixels):
    """Create a PNG file from raw RGBA pixel data."""
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = zlib.crc32(c) & 0xFFFFFFFF
        return struct.pack('>I', len(data)) + c + struct.pack('>I', crc)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))

    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter: none
        offset = y * width * 4
        raw.extend(pixels[offset:offset + width * 4])

    compressed = zlib.compress(bytes(raw), 9)
    idat = chunk(b'IDAT', compressed)
    iend = chunk(b'IEND', b'')

    return sig + ihdr + idat + iend


def lerp(a, b, t):
    return int(a + (b - a) * t)


def draw_filled_circle(pixels, cx, cy, r, color, width):
    """Draw a filled circle."""
    r2 = r * r
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r2:
                px, py = cx + dx, cy + dy
                if 0 <= px < width and 0 <= py < HEIGHT:
                    idx = (py * width + px) * 4
                    pixels[idx] = color[0]
                    pixels[idx + 1] = color[1]
                    pixels[idx + 2] = color[2]
                    pixels[idx + 3] = color[3]


def draw_rounded_rect(pixels, x1, y1, x2, y2, radius, color, width_px):
    """Draw a filled rounded rectangle."""
    for y in range(max(0, y1), min(HEIGHT, y2 + 1)):
        for x in range(max(0, x1), min(width_px, x2 + 1)):
            # Check if point is inside rounded rect
            inside = False
            # Main body (excluding corners)
            if x1 + radius <= x <= x2 - radius or y1 + radius <= y <= y2 - radius:
                inside = True
            else:
                # Check corners
                corners = [
                    (x1 + radius, y1 + radius),
                    (x2 - radius, y1 + radius),
                    (x1 + radius, y2 - radius),
                    (x2 - radius, y2 - radius),
                ]
                for cx, cy in corners:
                    dx = x - cx
                    dy = y - cy
                    if dx * dx + dy * dy <= radius * radius:
                        inside = True
                        break
            if inside:
                idx = (y * width_px + x) * 4
                # Alpha blend
                a = color[3] / 255.0
                pixels[idx] = int(pixels[idx] * (1 - a) + color[0] * a)
                pixels[idx + 1] = int(pixels[idx + 1] * (1 - a) + color[1] * a)
                pixels[idx + 2] = int(pixels[idx + 2] * (1 - a) + color[2] * a)
                pixels[idx + 3] = min(255, pixels[idx + 3] + color[3])


def draw_arrow(pixels, x_start, x_end, y_center, color, width_px):
    """Draw a right-pointing arrow."""
    shaft_half_h = 4
    head_half_h = 14
    head_len = 22
    shaft_end = x_end - head_len

    # Draw shaft
    for y in range(y_center - shaft_half_h, y_center + shaft_half_h + 1):
        for x in range(x_start, shaft_end + 1):
            if 0 <= x < width_px and 0 <= y < HEIGHT:
                idx = (y * width_px + x) * 4
                pixels[idx] = color[0]
                pixels[idx + 1] = color[1]
                pixels[idx + 2] = color[2]
                pixels[idx + 3] = color[3]

    # Draw arrowhead (triangle)
    for x in range(shaft_end, x_end + 1):
        t = (x - shaft_end) / max(1, head_len)
        half_h = int(head_half_h * (1 - t))
        for y in range(y_center - half_h, y_center + half_h + 1):
            if 0 <= x < width_px and 0 <= y < HEIGHT:
                idx = (y * width_px + x) * 4
                pixels[idx] = color[0]
                pixels[idx + 1] = color[1]
                pixels[idx + 2] = color[2]
                pixels[idx + 3] = color[3]


# Simple 5x7 bitmap font for uppercase letters, digits, and space
FONT = {
    'A': ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    'B': ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    'C': ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    'D': ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    'E': ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    'F': ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    'G': ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
    'H': ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    'I': ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
    'J': ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
    'K': ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    'L': ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    'M': ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    'N': ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    'O': ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    'P': ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    'Q': ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    'R': ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    'S': ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    'T': ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    'U': ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    'V': ["10001", "10001", "10001", "10001", "01010", "01010", "00100"],
    'W': ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
    'X': ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    'Y': ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    'Z': ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    ' ': ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
    '0': ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    '1': ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    '2': ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
    '3': ["01110", "10001", "00001", "00110", "00001", "10001", "01110"],
    '4': ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    '5': ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    '6': ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
    '7': ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    '8': ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    '9': ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
}


def draw_text(pixels, text, start_x, start_y, scale, color, width_px):
    """Draw text using bitmap font."""
    cursor_x = start_x
    for ch in text.upper():
        glyph = FONT.get(ch)
        if glyph is None:
            cursor_x += 4 * scale
            continue
        for row_idx, row in enumerate(glyph):
            for col_idx, bit in enumerate(row):
                if bit == '1':
                    for sy in range(scale):
                        for sx in range(scale):
                            px = cursor_x + col_idx * scale + sx
                            py = start_y + row_idx * scale + sy
                            if 0 <= px < width_px and 0 <= py < HEIGHT:
                                idx = (py * width_px + px) * 4
                                a = color[3] / 255.0
                                pixels[idx] = int(pixels[idx] * (1 - a) + color[0] * a)
                                pixels[idx + 1] = int(pixels[idx + 1] * (1 - a) + color[1] * a)
                                pixels[idx + 2] = int(pixels[idx + 2] * (1 - a) + color[2] * a)
                                pixels[idx + 3] = min(255, pixels[idx + 3] + color[3])
        cursor_x += (len(glyph[0]) + 1) * scale


def text_width(text, scale):
    """Calculate text width in pixels."""
    w = 0
    for ch in text.upper():
        glyph = FONT.get(ch)
        if glyph is None:
            w += 4 * scale
        else:
            w += (len(glyph[0]) + 1) * scale
    return w - scale  # remove trailing space


def main():
    pixels = bytearray(WIDTH * HEIGHT * 4)

    # Background: soft gradient (dark blue-gray to slightly lighter)
    bg_top = (24, 24, 32)      # dark
    bg_bottom = (38, 38, 52)   # slightly lighter

    for y in range(HEIGHT):
        t = y / (HEIGHT - 1)
        r = lerp(bg_top[0], bg_bottom[0], t)
        g = lerp(bg_top[1], bg_bottom[1], t)
        b = lerp(bg_top[2], bg_bottom[2], t)
        for x in range(WIDTH):
            idx = (y * WIDTH + x) * 4
            pixels[idx] = r
            pixels[idx + 1] = g
            pixels[idx + 2] = b
            pixels[idx + 3] = 255

    # Subtle radial gradient overlay (lighter in center)
    cx, cy = WIDTH // 2, HEIGHT // 2 - 20
    max_dist = math.sqrt(cx * cx + cy * cy)
    for y in range(HEIGHT):
        for x in range(WIDTH):
            dist = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            t = min(1.0, dist / max_dist)
            brightness = int(18 * (1 - t * t))
            idx = (y * WIDTH + x) * 4
            pixels[idx] = min(255, pixels[idx] + brightness)
            pixels[idx + 1] = min(255, pixels[idx + 1] + brightness)
            pixels[idx + 2] = min(255, pixels[idx + 2] + brightness)

    # Icon placeholder areas (subtle circular glow under where icons will sit)
    # App icon center: ~170, 220    Applications icon center: ~490, 220
    for center_x in [170, 490]:
        for y in range(HEIGHT):
            for x in range(max(0, center_x - 70), min(WIDTH, center_x + 70)):
                dist = math.sqrt((x - center_x) ** 2 + (y - 220) ** 2)
                if dist < 65:
                    glow = int(10 * (1 - dist / 65))
                    idx = (y * WIDTH + x) * 4
                    pixels[idx] = min(255, pixels[idx] + glow)
                    pixels[idx + 1] = min(255, pixels[idx + 1] + glow)
                    pixels[idx + 2] = min(255, pixels[idx + 2] + glow + 2)

    # Arrow between icon positions
    arrow_color = (140, 140, 180, 200)
    draw_arrow(pixels, 240, 420, 220, arrow_color, WIDTH)

    # Title text at top
    title = "INSTALL KOTO"
    scale = 3
    tw = text_width(title, scale)
    tx = (WIDTH - tw) // 2
    draw_text(pixels, title, tx, 50, scale, (220, 220, 240, 230), WIDTH)

    # Subtitle text
    subtitle = "DRAG TO APPLICATIONS"
    scale2 = 2
    sw = text_width(subtitle, scale2)
    sx = (WIDTH - sw) // 2
    draw_text(pixels, subtitle, sx, 320, scale2, (160, 160, 180, 180), WIDTH)

    # Write PNG
    png_data = create_png(WIDTH, HEIGHT, bytes(pixels))
    out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'build')
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'dmg-background.png')
    with open(out_path, 'wb') as f:
        f.write(png_data)
    print(f"DMG background created: {out_path} ({WIDTH}x{HEIGHT})")


if __name__ == '__main__':
    main()
