export default async function handler(req, res) {
  // CORS 처리 (웹페이지에서 API를 호출할 수 있도록 허용)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { questionNumber, typedText, imageBase64, rubric } = req.body || {};
    
    // Vercel에 숨겨둔 Gemini API 키 불러오기
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
    }

    const exampleAnswers = questionNumber === 1
      ? [
          '지역의 역사를 알리는 일에 참여한다.',
          '지역의 국가유산에 관심을 가지고 자주 찾아간다.',
          '국가유산에 대해 자세히 공부한다.',
          '박물관, 기념관, 유적지를 찾아가 살펴본다.',
          '국가유산을 함부로 훼손하지 않고 보호한다.',
          '국가유산 지킴이 활동이나 축제에 참여한다.'
        ]
      : [
          '4학년 1학기 동안 우리 지역의 국가유산에 대해 자세히 공부한다.',
          '주말에 가족과 우리 지역의 국가유산을 직접 찾아가 본다.',
          '우리 지역의 박물관이나 유적지를 방문한다.',
          '지역 국가유산을 조사하여 친구들에게 소개한다.',
          '국가유산을 보호하는 포스터나 안내문을 만든다.',
          '국가유산을 훼손하지 않고 깨끗하게 이용한다.'
        ];

    // AI에게 내릴 채점 프롬프트(명령어)
    const prompt = `초등 4학년 사회 서술형 답안을 채점해 주세요.\n문항 번호: ${questionNumber}\n채점 기준: ${rubric}\n예시 답안: ${exampleAnswers.join(' / ')}\n키보드 입력: ${typedText || ''}\n손글씨 이미지가 있으면 먼저 글자를 인식한 뒤 채점하세요.\n채점 원칙: 예시 답안과 단어가 완전히 같지 않아도 의미가 비슷하면 정답 또는 부분 정답으로 인정하세요. 지역의 역사, 국가유산, 보존, 보호, 알리기, 방문, 조사, 지킴이, 축제, 실천 계획의 의미가 들어가면 긍정적으로 평가하세요.\n점수는 0~10점입니다. 의미가 충분히 비슷하면 8~10점, 일부만 맞으면 5~7점, 관련성이 낮으면 0~4점으로 주세요.\n반드시 JSON만 반환하세요. {"extracted_text":"","score":0,"is_correct":true,"feedback":"","keywords_found":[]}`;

    const parts = [{ text: prompt }];
    
    // 손글씨 이미지가 있으면 추가
    if (imageBase64) {
      parts.push({ 
        inline_data: { mime_type: 'image/png', data: imageBase64 } 
      });
    }

    // Gemini API 호출
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: "application/json",
        }
      })
    });

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(text);
    
    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Serverless Function Error:', error);
    return res.status(500).json({ 
      error: String(error), 
      extracted_text: '', 
      score: 0, 
      is_correct: false, 
      feedback: '서버리스 AI 채점 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 
      keywords_found: [] 
    });
  }
}
