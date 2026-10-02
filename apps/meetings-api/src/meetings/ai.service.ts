import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  async summarizeTopic(
    topicTitle: string,
    topicDescription: string | null,
    transcriptions: { userName: string; userClub: string | null; text: string }[],
    voteDetails?: {
      method: string;
      majority: string;
      yes: number;
      no: number;
      abstain: number;
      approved: boolean | null;
      ballotType?: string;
      candidates?: { name: string; votes: number }[];
      detailedVotes?: { clubName: string; choice: string; candidateName?: string | null }[];
    },
    motions?: {
      title: string;
      description: string | null;
      proposedByClubName: string;
      secondedByClubName: string | null;
      status: string;
    }[],
  ): Promise<string> {
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!geminiKey && !openaiKey) {
      this.logger.warn('No GEMINI_API_KEY or OPENAI_API_KEY found. AI summarization will fallback to a simple template.');
      return this.generateFallbackSummary(topicTitle, transcriptions, voteDetails, motions);
    }

    let prompt = `Actúas como un redactor de actas profesional para reuniones distritales de Rotaract.
Tu tarea es generar un registro formal y narrativo en español de las intervenciones de los participantes sobre el tema "${topicTitle}".

Detalles del tema:
- Título: ${topicTitle}
${topicDescription ? `- Descripción: ${topicDescription}` : ''}

Transcripciones de voz de los oradores (en orden cronológico):
${
  transcriptions.length > 0
    ? transcriptions.map((t) => `- ${t.userName}${t.userClub ? ` (Club: ${t.userClub})` : ''}: "${t.text}"`).join('\n')
    : '(No hubo participaciones orales registradas para este tema)'
}

`;

    if (motions && motions.length > 0) {
      prompt += `Mociones propuestas durante este tema:
${motions
  .map(
    (m) => `- Moción: "${m.title}" (${m.description || 'sin descripción'})
  Propuesta por: ${m.proposedByClubName}
  Secundada por: ${m.secondedByClubName || 'Nadie (Sin secundar)'}
  Estado final: ${m.status === 'APPROVED' ? 'Aprobada' : m.status === 'REJECTED' ? 'Rechazada' : m.status}
`,
  )
  .join('\n')}
`;
    }

    if (voteDetails) {
      prompt += `Detalles de la votación:
- Método de votación: ${voteDetails.method === 'SECRET' ? 'Secreta' : 'Pública'}
- Mayoría requerida: ${voteDetails.majority}
- Tipo de balota: ${voteDetails.ballotType || 'YES_NO'}
`;

      if (voteDetails.ballotType === 'CANDIDATE' && voteDetails.candidates) {
        prompt += `- Votos por candidato:
${voteDetails.candidates.map((c) => `  * ${c.name}: ${c.votes} votos`).join('\n')}
  * Abstenciones: ${voteDetails.abstain} votos
`;
      } else {
        prompt += `- Resultados numéricos: A favor (SÍ): ${voteDetails.yes} | En contra (NO): ${voteDetails.no} | Abstenciones: ${voteDetails.abstain}
- Decisión final: ${voteDetails.approved === true ? 'APROBADA' : voteDetails.approved === false ? 'RECHAZADA' : 'SIN DECISIÓN'}
`;
      }

      if (voteDetails.method === 'PUBLIC' && voteDetails.detailedVotes && voteDetails.detailedVotes.length > 0) {
        prompt += `- Desglose de votos nominales individuales:
${voteDetails.detailedVotes
  .map(
    (dv) =>
      `  * ${dv.clubName} votó: ${dv.choice === 'YES' ? 'A favor' : dv.choice === 'NO' ? 'En contra' : dv.choice === 'ABSTAIN' ? 'Abstención' : dv.choice}${dv.candidateName ? ` (Candidato: ${dv.candidateName})` : ''}`,
  )
  .join('\n')}
`;
      }
    }

    prompt += `
Instrucciones de redacción:
1. Redacta en un tono formal, claro e institucional, apto para un acta oficial de Rotaract.
2. IMPORTANTE: No hagas un resumen abstracto genérico. Debes detallar y narrar las intervenciones individuales en tercera persona (estilo indirecto), indicando explícitamente el nombre y apellido del orador y el club al que representa.
   Por ejemplo: "El representante de [Club], [Nombre y Apellido], expuso/mencionó que [resumen en tercera persona de su comentario]".
   Si un orador no tiene club indicado, menciónalo solo por su nombre y apellido, sin inventarle un club ni un cargo.
3. Si un mismo orador tiene múltiples fragmentos seguidos, agrúpalos y redáctalos en un solo párrafo fluido para evitar repeticiones.
4. Limpia el lenguaje coloquial, muletillas o repeticiones de la transcripción, pero mantén fielmente el sentido y los puntos clave explicados por el orador.
5. Menciona claramente cualquier moción propuesta durante el tema, quién la presentó/secundó y si fue aprobada o rechazada.
6. Concluye resumiendo el resultado de la votación (si la hubo) de forma clara y precisa.
7. Redacta únicamente el texto de la sección del acta en español, sin saludos, encabezados ni explicaciones adicionales.`;

    try {
      if (geminiKey) {
        return await this.callGemini(geminiKey, prompt);
      } else {
        return await this.callOpenAI(openaiKey!, prompt);
      }
    } catch (error) {
      this.logger.error(`Error generating AI summary: ${error.message}`, error.stack);
      return this.generateFallbackSummary(topicTitle, transcriptions, voteDetails, motions);
    }
  }

  private async callGemini(apiKey: string, prompt: string): Promise<string> {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${errText}`);
    }

    const data: any = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Invalid response structure from Gemini API');
    }
    return text.trim();
  }

  private async callOpenAI(apiKey: string, prompt: string): Promise<string> {
    const url = 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errText}`);
    }

    const data: any = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error('Invalid response structure from OpenAI API');
    }
    return text.trim();
  }

  private generateFallbackSummary(
    topicTitle: string,
    transcriptions: { userName: string; userClub: string | null; text: string }[],
    voteDetails?: any,
    motions?: any[],
  ): string {
    let summary = `Se abrió el espacio de debate sobre el tema "${topicTitle}". `;

    if (transcriptions.length > 0) {
      summary += `Se registraron las intervenciones de: ${transcriptions.map((t) => `${t.userName}${t.userClub ? ` (${t.userClub})` : ''}`).join(', ')}. `;
    } else {
      summary += 'No se registraron intervenciones orales. ';
    }

    if (motions && motions.length > 0) {
      for (const m of motions) {
        summary += `El club ${m.proposedByClubName} propuso la moción "${m.title}", la cual finalizó en estado ${m.status === 'APPROVED' ? 'Aprobada' : m.status === 'REJECTED' ? 'Rechazada' : m.status}. `;
      }
    }

    if (voteDetails) {
      if (voteDetails.ballotType === 'CANDIDATE' && voteDetails.candidates) {
        summary += `Se procedió a la votación por candidatos: ${voteDetails.candidates.map((c: any) => `${c.name} (${c.votes} votos)`).join(', ')} con ${voteDetails.abstain} abstenciones. `;
      } else {
        summary += `Se realizó la votación con el siguiente resultado: ${voteDetails.yes} votos a favor, ${voteDetails.no} votos en contra y ${voteDetails.abstain} abstenciones. La propuesta fue ${voteDetails.approved ? 'APROBADA' : 'RECHAZADA'}. `;
      }
    }

    return summary;
  }
}
