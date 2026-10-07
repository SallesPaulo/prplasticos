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

  if (!item) {
    return null;
  }

  return decodeURIComponent(
    item.substring(nome.length + 1)
  );
}
 
function criarCookieLogin(token) {
  return [
    `painel_token=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Max-Age=28800"
  ].join("; ");
}

function criarCookieLogout() {
  return [
    "painel_token=",
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Max-Age=0"
  ].join("; ");
}

module.exports = async (req, res) => {

  const emailCorreto = process.env.PAINEL_EMAIL;
  const senhaCorreta = process.env.PAINEL_SENHA;
  const segredo = process.env.SEGREDO_DO_PAINEL;

  /*
  ==========================================
  VERIFICAR CONFIGURAÇÃO
  ==========================================
  */

  if (!emailCorreto || !senhaCorreta || !segredo) {
    console.error("Variáveis de ambiente do painel não configuradas.");

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
      sucesso: false,
      erro: "Sessão não autorizada."
    });
  }

  /*
  ==========================================
  FAZER LOGIN
  ==========================================
  */

  if (req.method === "POST") {

    try {

      const body = req.body || {};

      const email = String(body.email || "").trim();
      const senha = String(body.senha || "");

      console.log("Tentativa de login:", email);

      if (!email || !senha) {
        return res.status(400).json({
          sucesso: false,
          erro: "E-mail e senha são obrigatórios."
        });
      }

      /*
      ==========================================
      COMPARAÇÃO DO LOGIN
      ==========================================
      */

      if (
        email !== emailCorreto ||
        senha !== senhaCorreta
      ) {

        console.log("Login recusado:", email);

        return res.status(401).json({
          sucesso: false,
          erro: "E-mail ou senha incorretos."
        });
      }

      /*
      ==========================================
      LOGIN CORRETO
      ==========================================
      */

      const token = criarToken(
        emailCorreto,
        senhaCorreta,
        segredo
      );

      res.setHeader(
        "Set-Cookie",
        criarCookieLogin(token)
      );

      console.log("Login autorizado:", email);

      return res.status(200).json({
        sucesso: true
      });

    } catch (erro) {

      console.error("Erro no login:", erro);

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

  /*
  ==========================================
  MÉTODO NÃO PERMITIDO
  ==========================================
  */

  return res.status(405).json({
    sucesso: false,
    erro: "Método não permitido."
  });
};
