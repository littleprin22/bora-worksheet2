export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
  }

  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64가 없습니다.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Vercel 환경변수 GEMINI_API_KEY가 설정되지 않았습니다.' });
    }

    const prompt = `너는 초등학교 4학년 사회 서술형 평가를 채점하는 교사야.
학습 주제: 시장에서는 어떤 경제활동이 이루어질까요? 생산과 소비.
학생은 손글씨로 다음 문항에 답했다.
문항: 내가 경험한 생산과 소비 활동을 각각 1가지 이상 쓰고, 왜 생산/소비인지 설명하세요.

먼저 이미지를 OCR로 읽고, 다음 기준으로 0~100점 채점해.
- 생산 경험 또는 생산 예시가 있음: 25점
- 소비 경험 또는 소비 예시가 있음: 25점
- 생산은 물건/서비스를 만들어 내거나 파는 활동이라는 뜻을 이해함: 25점
- 소비는 대가를 지불하고 물건/서비스를 사용하거나 이용하는 활동이라는 뜻을 이해함: 25점

인정 예시:
- 꽃집에서 꽃을 파는 것, 채소가게에서 상추를 파는 것, 세탁소에서 다림질하는 것, 음식이나 물건을 만드는 것, 서비스를 제공하는 것 등은 생산.
- 빵집에서 빵을 사 먹는 것, 학원에서 강습을 받는 것, 옷을 사 입는 것, 돈을 내고 이용하는 것 등은 소비.
- 문장이 서툴러도 뜻이 맞으면 인정한다.
- 가족끼리 집에서 먹으려고 음식을 만드는 것은 이 차시의 '시장 경제활동으로서의 생산'으로는 보지 않는다.

반드시 아래 JSON 형식만 출력해. 마크다운 코드블록은 쓰지 마.
{"extracted_text":"학생 손글씨를 읽은 내용","score":0,"is_correct":false,"feedback":"초등학생에게 줄 짧고 따뜻한 피드백"}`;

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/png', data: imageBase64 } }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    };

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || 'Gemini API 호출 실패' });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    }

    if (!parsed) {
      return res.status(500).json({ error: 'AI 응답을 JSON으로 해석하지 못했습니다.', raw: text });
    }

    return res.status(200).json({
      extracted_text: parsed.extracted_text || '',
      score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
      is_correct: Boolean(parsed.is_correct),
      feedback: parsed.feedback || ''
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || '서버 오류가 발생했습니다.' });
  }
}
