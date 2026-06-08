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
학습 주제: 합리적인 소비 생활과 생산 활동.
학생은 손글씨로 다음 문항에 답했다.
문항: 소비 생활을 합리적으로 하지 않으면 어떤 일이 생기는지 쓰고, 합리적인 소비 생활을 하는 방법을 1가지 이상 쓰세요.

먼저 이미지를 OCR로 읽고, 다음 기준으로 0~100점 채점해.
- 합리적으로 소비하지 않았을 때 생길 문제를 1가지 이상 설명함: 50점
- 합리적인 소비 생활 방법을 1가지 이상 설명함: 50점

인정 예시:
- 꼭 필요한 물건을 사지 못한다.
- 돈이 부족해진다.
- 낭비하게 된다.
- 사고 싶은 것을 못 산다.
- 용돈기입장을 쓴다.
- 필요한 것과 원하는 것을 구분한다.
- 미리 계획을 세워 돈을 쓴다.
- 저축을 한다.
- 예산을 정해서 사용한다.

채점 원칙:
- 맞춤법이 조금 틀려도 뜻이 맞으면 인정한다.
- 짧은 문장이어도 핵심 의미가 맞으면 인정한다.
- 초등학생 답안답게 쉬운 표현도 넓게 인정한다.

반드시 아래 JSON 형식만 출력해. 마크다운 코드블록은 쓰지 마.
{"extracted_text":"학생 손글씨를 읽은 내용","score":0,"is_correct":false,"feedback":"초등학생에게 줄 짧고 따뜻한 피드백"}`;

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: 'image/png',
                data: imageBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    };

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(body)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || 'Gemini API 호출 실패'
      });
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
      return res.status(500).json({
        error: 'AI 응답을 JSON으로 해석하지 못했습니다.',
        raw: text
      });
    }

    return res.status(200).json({
      extracted_text: parsed.extracted_text || '',
      score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
      is_correct: Boolean(parsed.is_correct),
      feedback: parsed.feedback || ''
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || '서버 오류가 발생했습니다.'
    });
  }
}
