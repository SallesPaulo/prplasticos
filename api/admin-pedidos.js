const crypto = require("crypto");

function obterCookie(req, nome) {
  const cookies = req.headers.cookie || "";
  const item = cookies
    .split(";")
    .map(c => c.trim())
    .find(c => c.startsWith(nome + "="));

  if (!item) return null;

  try {
    return decodeURIComponent(item.substring(nome.length + 1));
  } catch {
    return null;
  }
}

function tokenValido(token, esperado) {
  if (
    typeof token !== "string" ||
    token.length !== esperado.length ||
    !/^[a-f0-9]{64}$/i.test(token)
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(esperado)
  );
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (!["GET", "PATCH"].includes(req.method)) {
    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ erro: "Método não permitido." });
  }

  const email = process.env.PAINEL_EMAIL;
  const senha = process.env.PAINEL_SENHA;
  const segredo = process.env.SEGREDO_DO_PAINEL;
  const urlBase = process.env.SUPABASE_URL;
  const chave = process.env.CHAVE_SECRETA_SUPABASE;

  if (!email || !senha || !segredo || !urlBase || !chave) {
    return res.status(500).json({
      erro: "Configuração do servidor incompleta."
    });
  }

  const esperado = crypto
    .createHash("sha256")
    .update(email + senha + segredo)
    .digest("hex");

  const token = obterCookie(req, "painel_token");

  if (!tokenValido(token, esperado)) {
    return res.status(401).json({
      erro: "Sessão não autorizada."
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
    if (req.method === "GET") {
      const parametros = new URLSearchParams({
        select: "id,numero,data_pedido,nome,empresa,cnpj,email,telefone,cidade,itens,total,observacoes,status,cliente_id,criado_em",
        order: "data_pedido.desc",
        limit: "100"
      });

      const resposta = await fetch(
        `${supabaseUrl}/rest/v1/pedidos?${parametros}`,
        { headers, cache: "no-store" }
      );

      const dados = await resposta.json();

      if (!resposta.ok) {
        console.error("Erro Supabase:", resposta.status, dados);
        return res.status(502).json({
          erro: "Não foi possível consultar os pedidos."
        });
      }

      return res.status(200).json(dados);
    }

    const body = req.body || {};
    const id = body.id;
    const novoStatus = body.status;

    const statusPermitidos = [
      "Recebido",
      "Em produção",
      "Separação",
      "Faturado",
      "Enviado",
      "Entregue"
    ];

    if (
      (typeof id !== "number" && typeof id !== "string") ||
      !String(id).trim() ||
      !statusPermitidos.includes(novoStatus)
    ) {
      return res.status(400).json({
        erro: "Pedido ou status inválido."
      });
    }

    const parametros = new URLSearchParams({
      id: `eq.${id}`,
      select: "id,numero,data_pedido,nome,empresa,total,status,cliente_id"
    });

    const resposta = await fetch(
      `${supabaseUrl}/rest/v1/pedidos?${parametros}`,
      {
        method: "PATCH",
        headers: {
          ...headers,
          Prefer: "return=representation"
        },
        body: JSON.stringify({ status: novoStatus })
      }
    );

    const dados = await resposta.json();

    if (!resposta.ok) {
      console.error("Erro ao atualizar pedido:", resposta.status, dados);
      return res.status(502).json({
        erro: "Não foi possível atualizar o pedido."
      });
    }

    if (!Array.isArray(dados) || dados.length === 0) {
      return res.status(404).json({
        erro: "Pedido não encontrado."
      });
    }

    const pedido = dados[0];

    const historico = await fetch(
      `${supabaseUrl}/rest/v1/historico_status_pedidos`,
      {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          pedido_id: pedido.id,
          status: novoStatus,
          observacao: "Status atualizado pelo painel"
        })
      }
    );

    if (!historico.ok) {
      console.error(
        "Status atualizado, mas houve falha ao registrar histórico:",
        historico.status,
       
