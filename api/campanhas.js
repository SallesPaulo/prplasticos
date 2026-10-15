
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

  if (!email || !senha || !segredo || !token) {
    return false;
  }

  const esperado = criarToken(email, senha, segredo);

  if (
    token.length !== esperado.length ||
    !/^[a-f0-9]+$/i.test(token)
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(esperado)
  );
}

function texto(valor, limite = 5000) {
  if (typeof valor !== "string") return "";
  return valor.trim().slice(0, limite);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (!sessaoValida(req)) {
    return res.status(401).json({
      sucesso: false,
      erro: "Sessão do painel não autorizada."
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

      if (!resposta.ok) {
        console.error(
          "Erro ao consultar campanhas:",
          await resposta.text()
        );

        return res.status(502).json({
          sucesso: false,
          erro: "Não foi possível consultar as campanhas."
        });
      }

      const dados = await resposta.json();

      return res.status(200).json({
        sucesso: true,
        campanhas: dados
      });
    }

    if (req.method === "POST") {
      const body = req.body || {};

      const campanha = {
        empresa: texto(body.empresa, 150),
        nome: texto(body.nome, 200),
        assunto: texto(body.assunto, 300),
        lista: texto(body.lista, 100),
        mensagem: texto(body.mensagem, 50000),
        enviados: Number(body.enviados) || 0
      };

      if (
        !campanha.nome ||
        !campanha.assunto ||
        !campanha.empresa
      ) {
        return res.status(400).json({
          sucesso: false,
          erro: "Empresa, nome e assunto são obrigatórios."
        });
      }

      if (
        !Number.isSafeInteger(campanha.enviados) ||
        campanha.enviados < 0
      ) {
        return res.status(400).json({
          sucesso: false,
          erro: "Quantidade de e-mails inválida."
        });
      }

      const resposta = await fetch(endpoint, {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=representation"
        },
        body: JSON.stringify(campanha)
      });

      if (!resposta.ok) {
        console.error(
          "Erro ao salvar campanha:",
          await resposta.text()
        );

        return res.status(502).json({
          sucesso: false,
          erro: "Não foi possível salvar a campanha."
        });
      }

      const dados = await resposta.json();

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
