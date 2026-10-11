
const crypto = require("crypto");

function obterCookie(req, nome) {
  const cookies = req.headers.cookie || "";
  const item = cookies
    .split(";")
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(nome + "="));

  return item
    ? decodeURIComponent(item.substring(nome.length + 1))
    : null;
}

function criarToken(email, senha, segredo) {
  return crypto
    .createHash("sha256")
    .update(email + senha + segredo)
    .digest("hex");
}

function sessaoValida(req) {
  const email = process.env.PAINEL_EMAIL;
  const senha = process.env.PAINEL_SENHA;
  const segredo = process.env.SEGREDO_DO_PAINEL;
  const token = obterCookie(req, "painel_token");

  if (!email || !senha || !segredo || !token) return false;

  const esperado = criarToken(email, senha, segredo);

  if (token.length !== esperado.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(esperado)
  );
}

module.exports = async (req, res) => {
  if (!sessaoValida(req)) {
    return res.status(401).json({
      sucesso: false,
      erro: "Sessão não autorizada."
    });
  }

  const urlBase = process.env.SUPABASE_URL;
  const chave = process.env.CHAVE_SECRETA_SUPABASE;

  if (!urlBase || !chave) {
    return res.status(500).json({
      sucesso: false,
      erro: "Configuração do banco não encontrada."
    });
  }

  const url = urlBase
    .replace(/\/rest\/v1\/?$/, "")
    .replace(/\/rest\/?$/, "")
    .replace(/\/+$/, "");

  const endpoint = `${url}/rest/v1/campanhas`;

  const headers = {
    apikey: chave,
    Authorization: `Bearer ${chave}`,
    "Content-Type": "application/json"
  };

  try {
    if (req.method === "GET") {
      const resposta = await fetch(
        `${endpoint}?select=*&order=created_at.desc`,
        { headers }
      );

      const dados = await resposta.json();

      if (!resposta.ok) {
        console.error("Erro ao consultar campanhas:", dados);
        return res.status(502).json({
          sucesso: false,
          erro: "Não foi possível consultar as campanhas."
        });
      }

      return res.status(200).json({
        sucesso: true,
        campanhas: dados
      });
    }

    if (req.method === "POST") {
      const campanha = req.body || {};

      if (!campanha.nome || !campanha.assunto) {
        return res.status(400).json({
          sucesso: false,
          erro: "Nome e assunto são obrigatórios."
        });
      }

      const resposta = await fetch(endpoint, {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          nome: campanha.nome,
          assunto: campanha.assunto,
          lista: campanha.lista || "",
          mensagem: campanha.mensagem || "",
          enviados: Number(campanha.enviados) || 0
        })
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        console.error("Erro ao salvar campanha:", dados);
        return res.status(502).json({
          sucesso: false,
          erro: "Não foi possível salvar a campanha."
        });
      }

      return res.status(201).json({
        sucesso: true,
        campanha: dados[0]
      });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({
      sucesso: false,
      erro: "Método não permitido."
    });
  } catch (erro) {
    console.error("Erro na API de campanhas:", erro);
    return res.status(500).json({
      sucesso: false,
      erro: "Erro interno ao acessar o banco."
    });
  }
};

