import axios from "axios";
import { getModel } from "../utils/model.js";

import { saveArtifact } from "../utils/artifactStore.js";
import { checkAgentLimit } from "../config/agentRateLimit.js";
import { deductCredits } from "../utils/deductCredits.js";

export const imageAgent = async (state) => {

  try {

await checkAgentLimit(
    state.userId,
    "image"
  );
 await deductCredits(state.userId, "image", {
      runId: state.requestId,
      conversationId: state.conversationId,
    });


    const llm =
      getModel("image");

    const promptResponse =
      await llm.invoke(`

You are an elite AI image prompt engineer.

Convert the user request into a highly detailed image generation prompt.

Requirements:

- Cinematic lighting
- Professional composition
- Ultra realistic
- High detail
- Beautiful color palette
- Sharp focus
- 8K quality
- Photorealistic
- Depth of field
- Professional photography
- Stunning visuals

Return only the image prompt.

User Request:

${state.prompt}

`);

    const enhancedPrompt =
      promptResponse.content.trim();

    const imageUrl =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(
        enhancedPrompt
      )}`;

    const imageResponse =
      await axios.get(
        imageUrl,
        {
          responseType:
            "arraybuffer"
        }
      );

    const imageBuffer =
      Buffer.from(
        imageResponse.data
      );

    /**
     * The generator returns JPEG despite the .png the URL implies, so the type
     * is taken from the response and confirmed against the file's magic bytes
     * rather than assumed. Serving JPEG bytes labelled image/png mostly works,
     * because browsers sniff content — but a download saved as .png that no
     * image editor will open is a confusing thing to hand someone.
     */
    const declaredType = String(imageResponse.headers?.["content-type"] ?? "");
    const isJpeg =
      imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8 && imageBuffer[2] === 0xff;

    const contentType = isJpeg
      ? "image/jpeg"
      : declaredType.startsWith("image/")
        ? declaredType.split(";")[0]
        : "image/png";

    const extension = contentType === "image/jpeg" ? "jpg" : "png";

    const fileName =
      `image-${Date.now()}.${extension}`;

    const { url } = await saveArtifact(
      imageBuffer,
      fileName,
      contentType,
      {
        userId: state.userId,
        conversationId: state.conversationId,
        ttlSeconds: 24 * 60 * 60,
      }
    );

    return {

      ...state,

     response: `
# 🖼️ Image Generated Successfully

![Generated Image](${url})

📥 [Download Image](${url})

⏳ Link expires in 24 hours.
`

    };

  } catch (error) {

    console.error(
      "Image Agent Error:",
      error
    );

    // Rethrown so the controller refunds the credits taken above. Returning a
    // message here counted as a successful run and kept the charge.
    throw error;

  }

};