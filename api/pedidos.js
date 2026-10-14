
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ erro: "Método não permitido." });
  }

  const {
    numero,
    nome,
    empresa,
    cnpj,
    email,
    telefone,
    cidade,
    itens,
    total,
    observacoes
  } = req.body || {};

  if (
    !numero ||
    !nome ||
    !empresa ||
    !email ||
    !Array.isArray(itens) ||
    itens.length === 0
  ) {
    return res.status(400).json({
      erro: "Preencha os dados obrigatórios do orçamento."
    });
  }

  const valorTotal = Number(total);

  if (!Number.isFinite(valorTotal) || valorTotal < 0) {
    return res.status(400).json({
      erro: "Valor total inválido."
    });
  }

  const url = process.env.SUPABASE_URL;
  const chave = process.env.CHAVE_SECRETA_SUPABASE;

  if (!url || !chave) {
    return res.status(500).json({
      erro: "Configuração do banco indisponível."
    });
  }

  try {
    const resposta = await fetch(
      `${url}/rest/v1/pedidos`,
      {
        method: "POST",
        headers: {
          apikey: chave,
          Authorization: `Bearer ${chave}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          numero,
          nome,
          empresa,
          cnpj: cnpj || null,
          email,
          telefone: telefone || null,
          cidade: cidade || null,
          itens,
          total: valorTotal,
          observacoes: observacoes || null
        })
      }
    );

    if (!resposta.ok) {
      const detalhe = await resposta.text();
      console.error("Erro ao salvar pedido:", detalhe);

      return res.status(500).json({
        erro: "Não foi possível salvar o orçamento."
      });
    }

    return res.status(201).json({
      sucesso: true,
      mensagem: "Orçamento registrado."
    });
  } catch (erro) {
    console.error("Erro na API de pedidos:", erro);

    return res.status(500).json({
      erro: "Falha ao comunicar com o banco de dados."
    });
  }
} 
