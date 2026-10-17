/**
 * Settings for the per-piece product shots made by the OpenAI image model.
 * `image_model` can be overridden with OPENAI_IMAGE_MODEL.
 */
export const IMAGE_CONFIG = {
  image_model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare",
  quality: "high",
  size: "1024x1024",
  background: "transparent",
  output_format: "png",
  /** Extra attempts after the first when a shot fails a check (wrong item or no real transparency). */
  max_retries: 2,
  /** Reject shots whose background isn't actually transparent. */
  verify_alpha_channel: true,
  /** Detection and shot checks answer in a fixed JSON schema. */
  use_structured_outputs: true,
} as const;
