
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      sucesso: false,
      erro: "Método não permitido."
    });
  }

  const urlBase = process.env.SUPABASE_URL;
  const chave = process.env.CHAVE_SECRETA_SUPABASE;

  if (!urlBase || !chave) {
    return res.status(500).json({
      sucesso: false,
      erro: "Banco de dados não configurado."
    });
  }

  const body = req.body || {};

  try {
    if (JSON.stringify(body).length > 60000) {
      return res.status(413).json({
        sucesso: false,
        erro: "Solicitação muito grande."
      });
    }
  } catch {
    return res.status(400).json({
      sucesso: false,
      erro: "Solicitação inválida."
    });
  }

  // Honeypot: campo oculto para detectar robôs.
  if (
    typeof body.website === "string" &&
    body.website.trim() !== ""
  ) {
    return res.status(400).json({
      sucesso: false,
      erro: "Solicitação inválida."
    });
  }

  const {
    numero,
    nome,
    empresa,
    cnpj,
    email: emailCliente,
    telefone,
    cidade,
    itens,
    total,
    observacoes
  } = body;

  const textoValido = (valor, max) =>
    typeof valor === "string" &&
    valor.trim().length > 0 &&
    valor.trim().length <= max;

  if (
    !textoValido(numero, 60) ||
    !textoValido(nome, 150) ||
    !textoValido(empresa, 200) ||
    !textoValido(emailCliente, 254) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCliente.trim()) ||
    !Array.isArray(itens) ||
    itens.length === 0 ||
    itens.length > 100
  ) {
    return res.status(400).json({
      sucesso: false,
      erro: "Confira os dados obrigatórios do orçamento."
    });
  }

  if (
    (cnpj != null &&
      (typeof cnpj !== "string" || cnpj.length > 30)) ||
    (telefone != null &&
      (typeof telefone !== "string" || telefone.length > 40)) ||
    (cidade != null &&
      (typeof cidade !== "string" || cidade.length > 120)) ||
    (observacoes != null &&
      (typeof observacoes !== "string" || observacoes.length > 3000))
  ) {
    return res.status(400).json({
      sucesso: false,
      erro: "Um ou mais campos excedem o limite permitido."
    });
  }

  let tamanhoItens;

  try {
    tamanhoItens = JSON.stringify(itens).length;
  } catch {
    return res.status(400).json({
      sucesso: false,
      erro: "Itens do orçamento inválidos."
    });
  }

  if (tamanhoItens > 50000) {
    return res.status(400).json({
      sucesso: false,
      erro: "Lista de itens muito grande."
    });
  }

  const valorTotal = Number(total);

  if (
    !Number.isFinite(valorTotal) ||
    valorTotal < 0 ||
    valorTotal > 1000000000
  ) {
    return res.status(400).json({
      sucesso: false,
      erro: "Valor total inválido."
    });
  }

  const ip = String(
    req.headers["x-forwarded-for"] || ""
  ).split(",")[0].trim();

  if (!ip) {
    return res.status(400).json({
      sucesso: false,
      erro: "Não foi possível validar a solicitação."
    });
  }

  const supabaseUrl = urlBase
    .replace(/\/rest\/v1\/?$/, "")
    .replace(/\/+$/, "");

  const headers = {
    apikey: chave,
    Authorization: `Bearer ${chave}`,
    "Content-Type": "application/json"
  };

  try {
    // Limite de solicitações por IP.
    const limiteResposta = await fetch(
      `${supabaseUrl}/rest/v1/rpc/verificar_limite_pedidos`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          p_ip: ip
        })
      }
    );

    if (!limiteResposta.ok) {
      console.error(
        "Falha ao verificar limite:",
        limiteResposta.status,
        await limiteResposta.text()
      );

      return res.status(503).json({
        sucesso: false,
        erro: "Não foi possível validar o envio. Tente novamente."
      });
    }

    const permitido = await limiteResposta.json();

    if (permitido !== true) {
      return res.status(429).json({
        sucesso: false,
        erro: "Limite de solicitações atingido. Tente novamente em 10 minutos."
      });
    }


    // Localiza o cliente pelo e-mail.
    const emailBusca = encodeURIComponent(emailCliente.trim());

    const consultaCliente = await fetch(
      `${supabaseUrl}/rest/v1/clientes?select=id&email=ilike.${emailBusca}&limit=1`,
      { method: "GET", headers }
    );

    if (!consultaCliente.ok) {
      console.error(
        "Falha ao consultar cliente:",
        consultaCliente.status,
        await consultaCliente.text()
      );

      return res.status(503).json({
        sucesso: false,
        erro: "Não foi possível validar o cadastro do cliente."
      });
    }

    const clientesEncontrados = await consultaCliente.json();

    const clienteId =
      clientesEncontrados.length > 0
        ? clientesEncontrados[0].id
        : null;

    // Grava o orçamento, mesmo para clientes não cadastrados.
    const resposta = await fetch(
      `${supabaseUrl}/rest/v1/pedidos`,
      {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          numero: numero.trim(),
          nome: nome.trim(),
          empresa: empresa.trim(),
          cnpj: cnpj?.trim() || null,
          email: emailCliente.trim(),
          telefone: telefone?.trim() || null,
          cidade: cidade?.trim() || null,
          itens,
          total: valorTotal,
          observacoes: observacoes?.trim() || null,
          cliente_id: clienteId
        })
      }
    );

    if (!resposta.ok) {
      console.error(
        "Falha ao salvar pedido:",
        resposta.status,
        await resposta.text()
      );

      return res.status(500).json({
        sucesso: false,
        erro: "Não foi possível salvar o orçamento."
      });
    }

    return res.status(201).json({
      sucesso: true,
      mensagem: "Orçamento registrado."
    });

  } catch (erro) {
    console.error("Erro ao salvar pedido:", erro);

    return res.status(500).json({
      sucesso: false,
      erro: "Falha ao comunicar com o banco de dados."
    });
  }
};
