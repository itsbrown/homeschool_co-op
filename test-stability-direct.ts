/**
 * Direct test of Stability AI API with provided key
 */

async function testStabilityAI() {
  console.log('🧪 Testing Stability AI API directly...');
  
  try {
    const response = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        text_prompts: [
          {
            text: 'Simple coloring book page featuring a happy cow on a farm. Black and white line art only, no fills or colors. Clean bold outlines perfect for children. Educational illustration style.',
            weight: 1
          },
          {
            text: 'blurry, low quality, photorealistic, photograph, 3d render, realistic lighting, shadows, gradients, color, filled shapes',
            weight: -1
          }
        ],
        cfg_scale: 7,
        height: 1024,
        width: 1024,
        steps: 20,
        samples: 1,
        style_preset: 'line-art'
      })
    });

    console.log('📡 Stability AI Response Status:', response.status);
    console.log('📡 Response Headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Stability AI Error Response:', errorText);
      throw new Error(`Stability AI API error: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();
    console.log('✅ Stability AI Response received');
    console.log('📊 Artifacts count:', responseData.artifacts?.length || 0);

    if (responseData.artifacts && responseData.artifacts.length > 0) {
      console.log('✅ Image generated successfully');
      console.log('📏 Base64 length:', responseData.artifacts[0].base64?.length || 0);
      return true;
    } else {
      console.log('❌ No artifacts in response');
      return false;
    }

  } catch (error) {
    console.error('❌ Stability AI test failed:', error);
    return false;
  }
}

testStabilityAI().then(success => {
  console.log(success ? '🎉 Stability AI test completed successfully' : '💥 Stability AI test failed');
  process.exit(success ? 0 : 1);
});