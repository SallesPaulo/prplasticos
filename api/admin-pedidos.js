const crypto = require("crypto");

function obterCookie(req, nome) {
  const cookies = req.headers.cookie || "";

  const item = cookies
    .split(";")
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(nome + "="));

  if (!item) return null;

  try {
    return decodeURIComponent(
      item.substring(nome.length + 1)
    );
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

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
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

  const parametros = new URLSearchParams({
    select: "id,numero,data_pedido,nome,empresa,cnpj,email,telefone,cidade,itens,total,observacoes,status,cliente_id,criado_em",
    order: "data_pedido.desc",
    limit: "100"
  });

  try {
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
      console.error(
        "Erro Supabase ao consultar pedidos:",
        resposta.status,
        dados
      );

      return res.status(502).json({
        erro: "Não foi possível consultar os pedidos."
      });
    }

    return res.status(200).json(dados);

  } catch (erro) {
    console.error("Erro na API administrativa:", erro);

   
