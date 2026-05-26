export async function POST(request) {
  try {
    const { imageBase64 } = await request.json();

    if (!imageBase64) {
      return Response.json(
        { error: "imageBase64가 없습니다." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "서버에 GEMINI_API_KEY 환경 변수가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const prompt = `
이 이미지는 초등학생이 스마트펜이나 손가락으로 쓴 손글씨 답안입니다.

문제:
바른 식습관의 중요성을 2가지 이상 써 봅시다.

채점 기준:
다음 의미가 2개 이상 들어 있으면 정답으로 인정합니다.
- 성장: 잘 자란다, 성장에 도움이 된다
- 힘/활력: 힘이 난다, 활기가 생긴다
- 질병 예방: 병에 안 걸린다, 질병에 안 걸린다, 아프지 않다
- 건강: 건강해진다, 몸이 튼튼해진다

단, 학생 손글씨 인식 과정에서 '건강해짐'이 '건강점', '건강이 지니', '건강짐'처럼 조금 이상하게 읽혀도 문맥상 건강해진다는 뜻이면 정답으로 인정하세요.

답이 너무 짧더라도 '건강해짐', '병에 안 걸림', '몸이 튼튼해짐'처럼 핵심 의미가 분명하면 정답입니다.

반드시 JSON으로만 응답하세요.

형식:
{
  "extracted_text": "인식한 학생 답안",
  "is_correct": true 또는 false,
  "feedback": "학생에게 줄 짧고 친절한 피드백"
}
`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/png",
                data: imageBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const modelNames = ["gemini-2.5-flash", "gemini-2.0-flash"];
    let lastError = null;

    for (const modelName of modelNames) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const geminiResponse = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        const data = await geminiResponse.json();

        if (!geminiResponse.ok) {
          lastError = data?.error?.message || `Gemini API 오류: ${geminiResponse.status}`;
          continue;
        }

        const responseText =
          data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        if (!responseText) {
          lastError = "Gemini 응답이 비어 있습니다.";
          continue;
        }

        let parsed;
        try {
          parsed = JSON.parse(
            responseText
              .replace(/```json/gi, "")
              .replace(/```/g, "")
              .trim()
          );
        } catch (parseError) {
          parsed = {
            extracted_text: responseText,
            is_correct: false,
            feedback: "AI가 답을 읽었지만 채점 형식이 올바르지 않아 선생님 확인이 필요합니다."
          };
        }

        return Response.json({
          extracted_text: parsed.extracted_text || "(인식된 내용 없음)",
          is_correct: !!parsed.is_correct,
          feedback:
            parsed.feedback ||
            "답안을 확인했습니다. 선생님이 한 번 더 살펴볼게요.",
          model: modelName
        });
      } catch (error) {
        lastError = error.message;
      }
    }

    return Response.json(
      {
        error: lastError || "Gemini API 호출에 실패했습니다.",
        extracted_text: "(AI 통신 오류 발생)",
        is_correct: false,
        feedback: "AI 선생님 연결에 실패했습니다. 선생님이 직접 확인할 예정입니다."
      },
      { status: 500 }
    );
  } catch (error) {
    return Response.json(
      {
        error: error.message,
        extracted_text: "(서버 오류 발생)",
        is_correct: false,
        feedback: "서버 처리 중 오류가 발생했습니다. 선생님이 직접 확인할 예정입니다."
      },
      { status: 500 }
    );
  }
}
