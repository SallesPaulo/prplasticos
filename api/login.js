
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
  res.setHeader("Cache-Control", "no-store");

  if (!["GET", "POST", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, DELETE");

    return res.status(405).json({
      sucesso: false,
      erro: "Método não permitido."
    });
  }

  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", criarCookieLogout());

    return res.status(200).json({
      sucesso: true
    });
  }

  const emailCorreto = process.env.PAINEL_EMAIL;
  const senhaCorreta = process.env.PAINEL_SENHA;
  const segredo = process.env.SEGREDO_DO_PAINEL;

  if (!emailCorreto || !senhaCorreta || !segredo) {
    console.error(
      "Variáveis de ambiente do painel não configuradas."
    );

    return res.status(500).json({
      sucesso: false,
      erro: "Login não configurado corretamente no servidor."
    });
  }

  const tokenCorreto = criarToken(
    emailCorreto,
    senhaCorreta,
    segredo
  );

  if (req.method === "GET") {
    const token = obterCookie(req, "painel_token");

    if (tokenValido(token, tokenCorreto)) {
      return res.status(200).json({
        sucesso: true
      });
    }

    return res.status(401).json({
      sucesso: false,
      erro: "Sessão não autorizada."
    });
  }

  try {
    const body = req.body || {};
    const email = String(body.email || "").trim();
    const senha = String(body.senha || "");

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

    res.setHeader(
      "Set-Cookie",
      criarCookieLogin(tokenCorreto)
    );

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
};
