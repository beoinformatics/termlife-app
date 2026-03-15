import { Filter, GlProgram } from 'pixi.js'

const VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`

const FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uScanlineIntensity;
uniform float uGlowStrength;
uniform float uDistortion;

void main(void) {
    // Barrel distortion
    vec2 uv = vTextureCoord;
    vec2 center = uv - 0.5;
    float dist = dot(center, center);
    uv = uv + center * dist * uDistortion;

    // Sample texture
    vec4 color = texture(uTexture, uv);

    // Scanlines
    float scanline = sin(vTextureCoord.y * 800.0) * 0.5 + 0.5;
    scanline = mix(1.0, scanline, uScanlineIntensity);
    color.rgb *= scanline;

    // Phosphor glow (slight color fringing)
    float r = texture(uTexture, uv + vec2(0.001, 0.0)).r;
    float g = color.g;
    float b = texture(uTexture, uv - vec2(0.001, 0.0)).b;
    color.rgb = mix(color.rgb, vec3(r, g, b), uGlowStrength);

    // Vignette
    float vignette = 1.0 - dist * 2.0;
    vignette = clamp(vignette, 0.0, 1.0);
    color.rgb *= vignette;

    // Slight flicker
    float flicker = 0.95 + 0.05 * sin(uTime * 8.0);
    color.rgb *= flicker;

    finalColor = color;
}
`

export class CRTFilter {
  readonly filter: Filter
  private time = 0

  constructor() {
    const glProgram = GlProgram.from({
      vertex: VERTEX,
      fragment: FRAGMENT,
    })

    this.filter = new Filter({
      glProgram,
      resources: {
        crtUniforms: {
          uTime: { value: 0, type: 'f32' },
          uScanlineIntensity: { value: 0.22, type: 'f32' },
          uGlowStrength: { value: 0.4, type: 'f32' },
          uDistortion: { value: 0.08, type: 'f32' },
        },
      },
    })
  }

  update(dt: number) {
    this.time += dt / 60
    this.filter.resources.crtUniforms.uniforms.uTime = this.time
  }
}
