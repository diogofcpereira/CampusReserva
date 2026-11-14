import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  deleteUser,
  signOut
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";

import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// Mantém a mesma deteção de ambiente usada em firebase.js.
const IS_LOCAL_EMULATOR = ["localhost", "127.0.0.1"].includes(location.hostname);

// Elementos das vistas de autenticação.
const loginView = document.getElementById("loginView");
const registerView = document.getElementById("registerView");
const passwordResetView = document.getElementById("passwordResetView");

// Formulário de início de sessão.
const loginForm = document.getElementById("loginForm");
const loginBtn = document.getElementById("loginBtn");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorElement = document.getElementById("errorMessage");

// Formulário de criação de conta.
const registerForm = document.getElementById("registerForm");
const registerBtn = document.getElementById("registerBtn");
const displayNameInput = document.getElementById("displayName");
const registerEmailInput = document.getElementById("registerEmail");
const registerPasswordInput = document.getElementById("registerPassword");
const confirmPasswordInput = document.getElementById("confirmPassword");
const registerErrorElement = document.getElementById("registerErrorMessage");

// Formulário de recuperação da palavra-passe.
const passwordResetForm = document.getElementById("passwordResetForm");
const passwordResetBtn = document.getElementById("passwordResetBtn");
const resetEmailInput = document.getElementById("resetEmail");
const passwordResetErrorElement = document.getElementById("passwordResetErrorMessage");
const passwordResetSuccessElement = document.getElementById("passwordResetSuccessMessage");

// Botões de navegação entre as vistas.
const showRegisterBtn = document.getElementById("showRegisterBtn");
const showLoginBtn = document.getElementById("showLoginBtn");
const showPasswordResetBtn = document.getElementById("showPasswordResetBtn");
const backToLoginBtn = document.getElementById("backToLoginBtn");

// Mensagens de erro do Firebase Authentication.
const errorMessages = {
  "auth/invalid-email": "O endereço de email introduzido não é válido.",
  "auth/user-not-found": "Email ou palavra-passe incorretos.",
  "auth/wrong-password": "Email ou palavra-passe incorretos.",
  "auth/invalid-credential": "Email ou palavra-passe incorretos.",
  "auth/user-disabled": "Esta conta foi desativada. Contacta o administrador.",
  "auth/too-many-requests": "Demasiadas tentativas. Tenta novamente mais tarde.",
  "auth/network-request-failed": "Erro de ligação. Verifica a tua ligação e os emuladores Firebase.",
  "auth/missing-password": "Introduz a tua palavra-passe.",
  "auth/operation-not-allowed": "O acesso por email e palavra-passe não está ativado.",
  "auth/email-already-in-use": "Já existe uma conta com esse email.",
  "auth/weak-password": "A palavra-passe deve ter pelo menos 6 caracteres.",
  "permission-denied": "O Firestore recusou a criação do perfil. Confirma as regras carregadas no emulador."
};

/** Mostra uma mensagem de erro num dos formulários. */
function showError(element, message) {
  element.textContent = message;
  element.hidden = false;
}

/** Limpa uma mensagem de erro ou de confirmação. */
function clearMessage(element) {
  element.textContent = "";
  element.hidden = true;
}

/** Ativa/desativa um botão enquanto decorre uma operação. */
function setButtonLoading(button, isLoading, loadingText, normalText) {
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : normalText;
}

/** Limpa as mensagens apresentadas nas várias vistas. */
function clearAllMessages() {
  clearMessage(errorElement);
  clearMessage(registerErrorElement);
  clearMessage(passwordResetErrorElement);
  clearMessage(passwordResetSuccessElement);
}

/** Mostra a vista de início de sessão. */
function showLogin() {
  registerView.hidden = true;
  passwordResetView.hidden = true;
  loginView.hidden = false;
  clearAllMessages();
  emailInput.focus();
}

/** Mostra a vista de criação de conta. */
function showRegister() {
  loginView.hidden = true;
  passwordResetView.hidden = true;
  registerView.hidden = false;
  clearAllMessages();
  displayNameInput.focus();
}

/** Mostra a vista de recuperação e reaproveita o email do login, se existir. */
function showPasswordReset() {
  loginView.hidden = true;
  registerView.hidden = true;
  passwordResetView.hidden = false;
  clearAllMessages();

  resetEmailInput.value = emailInput.value.trim();
  resetEmailInput.focus();
}

showRegisterBtn.addEventListener("click", showRegister);
showLoginBtn.addEventListener("click", showLogin);
showPasswordResetBtn.addEventListener("click", showPasswordReset);
backToLoginBtn.addEventListener("click", showLogin);

// Início de sessão.
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  clearMessage(errorElement);
  setButtonLoading(loginBtn, true, "A entrar...", "Entrar na plataforma");

  try {
    await signInWithEmailAndPassword(auth, email, password);

    // Login concluído: encaminhar para a dashboard.
    window.location.href = "./dashboard.html";
  } catch (error) {
    console.error("Erro de autenticação:", error.code, error.message);
    showError(
      errorElement,
      errorMessages[error.code] || "Não foi possível iniciar sessão. Verifica os teus dados e tenta novamente."
    );
  } finally {
    setButtonLoading(loginBtn, false, "A entrar...", "Entrar na plataforma");
  }
});

// Envio do email de recuperação da palavra-passe.
passwordResetForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = resetEmailInput.value.trim();

  clearMessage(passwordResetErrorElement);
  clearMessage(passwordResetSuccessElement);
  setButtonLoading(
    passwordResetBtn,
    true,
    "A enviar...",
    "Enviar ligação de recuperação"
  );

  try {
    // O Firebase envia o email com a ligação segura para definir uma nova palavra-passe.
    // O idioma é definido para que o email seja apresentado em português, quando disponível.
    auth.languageCode = "pt";
    await sendPasswordResetEmail(auth, email);

    showPasswordResetConfirmation();
  } catch (error) {
    console.error("Erro ao pedir recuperação da palavra-passe:", error.code, error.message);

    // Com a proteção contra enumeração de emails ativa, o Firebase pode responder
    // com sucesso mesmo quando o endereço não corresponde a uma conta. Mantemos
    // a mesma mensagem neste caso para não revelar se um email está registado.
    if (error.code === "auth/user-not-found") {
      showPasswordResetConfirmation();
    } else {
      const message = errorMessages[error.code]
        || "Não foi possível enviar a ligação de recuperação. Tenta novamente mais tarde.";
      showError(passwordResetErrorElement, message);
    }
  } finally {
    setButtonLoading(
      passwordResetBtn,
      false,
      "A enviar...",
      "Enviar ligação de recuperação"
    );
  }
});

/** Apresenta sempre a mesma confirmação, independentemente de existir uma conta. */
function showPasswordResetConfirmation() {
  passwordResetSuccessElement.textContent = IS_LOCAL_EMULATOR
    ? "O pedido foi processado pelo emulador. Em ambiente local não é enviado um email real: consulta o terminal onde arrancaste os emuladores, copia a ligação de recuperação apresentada e abre-a no browser. Substitui YOUR_NEW_PASSWORD na ligação pela nova palavra-passe que pretendes utilizar."
    : "Se existir uma conta associada a este endereço, receberás um email com uma ligação para definires uma nova palavra-passe. Verifica também a pasta de spam.";
  passwordResetSuccessElement.hidden = false;
}

// Criação de uma nova conta.
registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const displayName = displayNameInput.value.trim();
  const email = registerEmailInput.value.trim();
  const password = registerPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  clearMessage(registerErrorElement);

  if (!displayName) {
    showError(registerErrorElement, "Introduz o teu nome completo.");
    displayNameInput.focus();
    return;
  }

  if (password !== confirmPassword) {
    showError(registerErrorElement, "As palavras-passe não coincidem.");
    confirmPasswordInput.focus();
    return;
  }

  if (password.length < 6) {
    showError(registerErrorElement, "A palavra-passe deve ter pelo menos 6 caracteres.");
    registerPasswordInput.focus();
    return;
  }

  setButtonLoading(registerBtn, true, "A criar conta...", "Criar conta");

  let userCredential = null;

  try {
    // 1. Criar a conta no Firebase Authentication.
    userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const newUser = userCredential.user;

    // 2. Criar o perfil em users/{uid}, seguindo o modelo do README.md.
    // O UID do documento é igual ao UID da conta no Authentication.
    await setDoc(doc(db, "users", newUser.uid), {
      uid: newUser.uid,
      email: newUser.email || email,
      displayName: displayName,
      role: "utilizador",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Só encaminhar para a dashboard depois de guardar o perfil com sucesso.
    window.location.href = "./dashboard.html";
  } catch (error) {
    console.error("Erro ao criar conta/perfil:", error.code, error.message);

    // Se o Authentication criou a conta mas o Firestore recusou o perfil,
    // tenta eliminar a conta para não deixar um registo incompleto.
    if (userCredential?.user) {
      try {
        await deleteUser(userCredential.user);
      } catch (rollbackError) {
        console.error("Não foi possível reverter a conta criada:", rollbackError.code, rollbackError.message);

        // Terminar a sessão mesmo que a eliminação da conta falhe.
        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error("Não foi possível terminar a sessão:", signOutError);
        }

        showError(
          registerErrorElement,
          "A conta foi criada no Authentication, mas não foi possível guardar o perfil na coleção users. A sessão foi terminada. Verifica as regras do Firestore no emulador antes de tentares novamente."
        );
        return;
      }

      showError(
        registerErrorElement,
        "Não foi possível guardar o perfil no Firestore. A criação da conta foi revertida. Confirma que o emulador do Firestore está ativo e que as regras permitem criar users/{uid}."
      );
      return;
    }

    showError(
      registerErrorElement,
      errorMessages[error.code] || "Não foi possível criar a conta. Verifica os dados e tenta novamente."
    );
  } finally {
    setButtonLoading(registerBtn, false, "A criar conta...", "Criar conta");
  }
});