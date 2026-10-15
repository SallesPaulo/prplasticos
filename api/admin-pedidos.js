
const crypto = require("crypto");

function obterCookie(req, nome) {
  const cookies = req.headers.cookie || "";
  const item = cookies
    .split(";")
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(nome + "="));

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
    return res.status(405).json({
      erro: "Método não permitido."
    });
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

  try {
    // ATUALIZAR STATUS
    if (req.method === "PATCH") {
      const corpo = req.body || {};
      const id = corpo.id;
      const novoStatus = corpo.status;

      const statusPermitidos = [
        "Recebido",
        "Em produção",
        "Separação",
        "Faturado",
        "Enviado",
        "Entregue"
      ];

      if (id === undefined || id === null || !String(id).trim()) {
        return res.status(400).json({
          erro: "ID do pedido não informado."
        });
      }

      if (!statusPermitidos.includes(novoStatus)) {
        return res.status(400).json({
          erro: "Status inválido."
        });
      }

      const resposta = await fetch(
        `${supabaseUrl}/rest/v1/pedidos?id=eq.${encodeURIComponent(String(id))}&select=id,numero,data_pedido,nome,empresa,email,total,status,cliente_id`,
        {
          method: "PATCH",
          headers: {
            apikey: chave,
            Authorization: `Bearer ${chave}`,
            "Content-Type": "application/json",
            Prefer: "return=representation"
          },
          body: JSON.stringify({
            status: novoStatus
          }),
          cache: "no-store"
        }
      );

      const texto = await resposta.text();
      let dados = [];

      try {
        dados = texto ? JSON.parse(texto) : [];
      } catch {
        dados = [];
      }

      if (!resposta.ok) {
        console.error("Erro ao atualizar pedido:", resposta.status, dados);
        return res.status(502).json({
          erro: "O Supabase não permitiu atualizar o pedido.",
          detalhe: dados
        });
      }

      if (!Array.isArray(dados) || dados.length === 0) {
        return res.status(404).json({
          erro: "Nenhum pedido foi atualizado. Verifique o ID do pedido."
        });
      }

      return res.status(200).json({
        sucesso: true,
        pedido: dados[0]
      });
    }

    // CONSULTAR PEDIDOS — MANTIDO
    const parametros = new URLSearchParams({
      select: "id,numero,data_pedido,nome,empresa,cnpj,email,telefone,cidade,itens,total,observacoes,status,cliente_id,criado_em",
      order: "data_pedido.desc",
      limit: "100"
    });

    const resposta = await fetch(
      `${supabaseUrl}/rest/v1/pedidos?${parametros}`,
      {
        headers: {
          apikey: chave,
          Authorization: `Bearer ${chave}`
        },
        cache: "no-store"
      }
    );

    const dados = await resposta.json();

    if (!resposta.ok) {
      console.error("Erro Supabase:", resposta.status, dados);
      return res.status(502).json({
        erro: "Não foi possível consultar os pedidos."
      });
    }

    return res.status(200).json(dados);

  } catch (erro) {
    console.error("Erro na API administrativa:", erro);
    return res.status(500).json({
      erro: "Falha ao processar a solicitação."
    });
  }
};
