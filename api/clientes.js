
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

function texto(valor, limite = 200) {
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

  const endpoint = `${url}/rest/v1/clientes`;

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
          "Erro ao consultar clientes:",
          await resposta.text()
        );

        return res.status(502).json({
          sucesso: false,
          erro: "Não foi possível consultar os clientes."
        });
      }

      const dados = await resposta.json();

      return res.status(200).json({
        sucesso: true,
        clientes: dados
      });
    }

    if (req.method === "POST") {
      const body = req.body || {};

      const cliente = {
        nome: texto(body.nome, 150),
        empresa: texto(body.empresa, 150),
        email: texto(body.email, 254).toLowerCase(),
        telefone: texto(body.telefone, 40),
        cidade: texto(body.cidade, 100),
        uf: texto(body.uf, 2).toUpperCase(),
        status: texto(body.status, 30) || "Ativo",
        observacao: texto(body.observacao, 2000)
      };

      if (
        !cliente.nome ||
        !cliente.empresa ||
        !cliente.email
      ) {
        return res.status(400).json({
          sucesso: false,
          erro: "Nome, empresa e e-mail são obrigatórios."
        });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email)) {
        return res.status(400).json({
          sucesso: false,
          erro: "Informe um e-mail válido."
        });
      }

      const resposta = await fetch(endpoint, {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=representation"
        },
        body: JSON.stringify(cliente)
      });

      if (!resposta.ok) {
        console.error(
          "Erro ao salvar cliente:",
          await resposta.text()
        );

        return res.status(502).json({
          sucesso: false,
          erro: "Não foi possível salvar o cliente."
        });
      }

      const dados = await resposta.json();

      return res.status(201).json({
        sucesso: true,
        cliente: dados[0]
      });
    }

    if (req.method === "PATCH") {
      const body = req.body || {};
      const id = Number(body.id);
      const origem = body.cliente || {};

      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
          sucesso: false,
          erro: "ID do cliente inválido."
        });
      }

      const cliente = {
        nome: texto(origem.nome, 150),
        empresa: texto(origem.empresa, 150),
        email: texto(origem.email, 254).toLowerCase(),
        telefone: texto(origem.telefone, 40),
        cidade: texto(origem.cidade, 100),
        uf: texto(origem.uf, 2).toUpperCase(),
        status: texto(origem.status, 30) || "Ativo",
        observacao: texto(origem.observacao, 2000)
      };

      if (
        !cliente.nome ||
        !cliente.empresa ||
        !cliente.email
      ) {
        return res.status(400).json({
          sucesso: false,
          erro: "Nome, empresa e e-mail são obrigatórios."
        });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email)) {
        return res.status(400).json({
          sucesso: false,
          erro: "Informe um e-mail válido."
        });
      }

      const resposta = await fetch(
        `${endpoint}?id=eq.${id}&select=*`,
        {
          method: "PATCH",
          headers: {
            ...headers,
            Prefer: "return=representation"
          },
          body: JSON.stringify(cliente)
        }
      );

      if (!resposta.ok) {
        console.error(
          "Erro ao editar cliente:",
          await resposta.text()
        );

        return res.status(502).json({
          sucesso: false,
          erro: "Não foi possível editar o cliente."
        });
      }

      const dados = await resposta.json();

      if (!dados.length) {
        return res.status(404).json({
          sucesso: false,
          erro: "Cliente não encontrado."
        });
      }

      return res.status(200).json({
        sucesso: true,
        cliente: dados[0]
      });
    }

    if (req.method === "DELETE") {
      const id = Number(req.query?.id);

      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
          sucesso: false,
          erro: "ID do cliente inválido."
        });
      }

      const resposta = await fetch(
        `${endpoint}?id=eq.${id}`,
        {
          method: "DELETE",
          headers: {
            ...headers,
            Prefer: "return=representation"
          }
        }
      );

      if (!resposta.ok) {
        console.error(
          "Erro ao excluir cliente:",
          await resposta.text()
        );

        return res.status(502).json({
          sucesso: false,
          erro: "Não foi possível excluir o cliente."
        });
      }

      return res.status(200).json({
        sucesso: true
      });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");

    return res.status(405).json({
      sucesso: false,
      erro: "Método não permitido."
    });
  } catch (erro) {
    console.error("Erro na API de clientes:", erro);

    return res.status(500).json({
      sucesso: false,
      erro: "Erro interno ao acessar o banco."
    });
  }
};
