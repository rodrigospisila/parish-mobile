/**
 * Textos do TERMO DA CATEQUESE pedido ao responsável pelo app
 * (M8 da auditoria — art. 14 §1º da LGPD: consentimento específico e em
 * destaque de um dos pais ou responsável).
 *
 * ATENÇÃO: redação PROVISÓRIA, neutra, escrita pela equipe técnica. O texto
 * jurídico final é decisão do Rodrigo (e de quem assessorar a paróquia).
 * Troque só aqui: a tela app/catechesis/consent.tsx lê tudo deste arquivo.
 * Ao mudar o sentido do texto, suba também a versão da política no backend
 * (CURRENT_POLICY_VERSION), que é gravada junto com o aceite.
 */
export const CATECHESIS_CONSENT_TEXT = {
  screenTitle: 'Termo da catequese',
  /** Aviso no cartão da matrícula e no Início */
  pendingBanner: 'Termo da catequese pendente — toque para responder',
  pendingBannerShort: 'Termo da catequese pendente',

  intro: (childName: string, isSelf: boolean) =>
    isSelf
      ? 'Para participar da catequese, precisamos do seu consentimento para o uso dos seus dados.'
      : `Como responsável por ${childName}, precisamos do seu consentimento para o uso dos dados dele(a) na catequese.`,

  dataTitle: 'Tratamento de dados',
  dataBody:
    'A paróquia usa nome, data de nascimento, contato da família, presença nos encontros, ' +
    'documentos dos sacramentos e anotações da equipe somente para organizar a catequese ' +
    '(turmas, encontros, chamada, avisos e certificados). Têm acesso a coordenação da ' +
    'catequese e a equipe da turma. Os dados não são vendidos nem usados para propaganda.',
  dataCheckbox: (isSelf: boolean) =>
    isSelf
      ? 'Autorizo o tratamento dos meus dados para a catequese, nos termos acima.'
      : 'Sou o responsável e autorizo o tratamento dos dados do catequizando para a catequese, nos termos acima.',

  imageTitle: 'Uso de imagem',
  imageBody:
    'Nos encontros, celebrações e eventos podem ser feitas fotos e vídeos, usados nos murais ' +
    'e nos canais de comunicação da paróquia. Essa resposta é separada: a catequese vale nos dois casos.',
  imageYes: 'Autorizo o uso da imagem pela paróquia',
  imageNo: 'Não autorizo — a equipe será avisada para preservar a imagem em fotos e vídeos',
  previousImageAnswer: (granted: boolean) =>
    `Resposta registrada antes: ${granted ? 'autorizado' : 'não autorizado'}. Escolha de novo para confirmar ou mudar.`,

  rights:
    'Você pode consultar, corrigir ou pedir a exclusão desses dados e retirar o consentimento ' +
    'a qualquer momento em Perfil → Privacidade ou com a secretaria da paróquia.',
  privacyLink: 'Política de privacidade',
  termsLink: 'Termos de uso',

  submit: 'Enviar respostas',
  submitting: 'Enviando...',
  missingData: 'Marque a autorização do tratamento de dados para continuar.',
  missingImage: 'Responda se autoriza ou não o uso de imagem.',
  successTitle: 'Termo registrado',
  successBody: 'Obrigado! A coordenação da catequese já vê a resposta.',
  notFound: 'Esta matrícula não tem termo pendente (ou já foi respondido).',
} as const;
