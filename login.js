const crypto = require("crypto");

function criarToken(email, senha, segredo) {
  return crypto
    .createHash("sha256")
    .update(email + senha + segredo)
    .digest("hex");
}

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

function criarCookieLogin(token) {
  return `painel_token=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`;
}

function criarCookieLogout() {
  return "painel_token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
}

module.exports = async (req, res) => {

  const emailCorreto = process.env.PAINEL_EMAIL;
  const senhaCorreta = process.env.PAINEL_SENHA;
  const segredo = process.env.SEGREDO_DO_PAINEL;

  if (!emailCorreto || !senhaCorreta || !segredo) {
    return res.status(500).json({
      sucesso: false,
      erro: "Login não configurado corretamente no servidor."
    });
  }

  /*
  ==========================================
  VERIFICAR SESSÃO
  ==========================================
  */

  if (req.method === "GET") {

    const token = obterCookie(req, "painel_token");

    const tokenCorreto = criarToken(
      emailCorreto,
      senhaCorreta,
      segredo
    );

    if (token && token === tokenCorreto) {
      return res.status(200).json({
        sucesso: true
      });
    }

    return res.status(401).json({
      sucesso: false
    });
  }

  /*
  ==========================================
  FAZER LOGIN
  ==========================================
  */

  if (req.method === "POST") {

    try {

      const { email, senha } = req.body || {};

      if (!email || !senha) {

        return res.status(400).json({
          sucesso: false,
          erro: "E-mail e senha são obrigatórios."
        });

      }

      if (
        email !== emailCorreto ||
        senha !== senhaCorreta
      ) {

        return res.status(401).json({
          sucesso: false,
          erro: "E-mail ou senha incorretos."
        });

      }

      const token = criarToken(
        emailCorreto,
        senhaCorreta,
        segredo
      );

      res.setHeader(
        "Set-Cookie",
        criarCookieLogin(token)
      );

      return res.status(200).json({
        sucesso: true
      });

    } catch (erro) {

      console.error(erro);

      return res.status(500).json({
        sucesso: false,
        erro: "Erro interno no servidor."
      });

    }
  }

  /*
  ==========================================
  LOGOUT
  ==========================================
  */

  if (req.method === "DELETE") {

    res.setHeader(
      "Set-Cookie",
      criarCookieLogout()
    );

    return res.status(200).json({
      sucesso: true
    });
  }

  return res.status(405).json({
    sucesso: false,
    erro: "Método não permitido"
  });
};
