import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  deleteUser,
  signOut
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";

import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// Elementos da página
const loginView = document.getElementById("loginView");
const registerView = document.getElementById("registerView");

const loginForm = document.getElementById("loginForm");
const loginBtn = document.getElementById("loginBtn");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorElement = document.getElementById("errorMessage");

const registerForm = document.getElementById("registerForm");
const registerBtn = document.getElementById("registerBtn");
const displayNameInput = document.getElementById("displayName");
const registerEmailInput = document.getElementById("registerEmail");
const registerPasswordInput = document.getElementById("registerPassword");
const confirmPasswordInput = document.getElementById("confirmPassword");
const registerErrorElement = document.getElementById("registerErrorMessage");

const showRegisterBtn = document.getElementById("showRegisterBtn");
const showLoginBtn = document.getElementById("showLoginBtn");

// Mensagens de erro do Firebase Authentication
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

/** Limpa a mensagem de erro de um formulário. */
function clearError(element) {
  element.textContent = "";
  element.hidden = true;
}

/** Ativa/desativa um botão enquanto decorre uma operação. */
function setButtonLoading(button, isLoading, loadingText, normalText) {
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : normalText;
}

/** Alterna entre o início de sessão e a criação de conta. */
function showLogin() {
  registerView.hidden = true;
  loginView.hidden = false;
  clearError(errorElement);
  clearError(registerErrorElement);
  emailInput.focus();
}

function showRegister() {
  loginView.hidden = true;
  registerView.hidden = false;
  clearError(errorElement);
  clearError(registerErrorElement);
  displayNameInput.focus();
}

showRegisterBtn.addEventListener("click", showRegister);
showLoginBtn.addEventListener("click", showLogin);

// Início de sessão
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  clearError(errorElement);
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

// Criação de uma nova conta
registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const displayName = displayNameInput.value.trim();
  const email = registerEmailInput.value.trim();
  const password = registerPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  clearError(registerErrorElement);

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
