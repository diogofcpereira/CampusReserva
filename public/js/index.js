    import {
        initializeApp
    } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";

    import {
        getAuth,
        signInWithEmailAndPassword
    } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";

    const firebaseConfig = {
        apiKey: "AIzaSyCHeWE5G8S95G0XzNRlussdIn9jt0q8i7o",
        authDomain: "campusreservage.firebaseapp.com",
        projectId: "campusreservage",
        storageBucket: "campusreservage.firebasestorage.app",
        messagingSenderId: "834601060186",
        appId: "1:601060186:web:877fe843714f16b8f85563"
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);

    const loginForm = document.getElementById("loginForm");
    const loginBtn = document.getElementById("loginBtn");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const errorElement = document.getElementById("errorMessage");

    // Mensagens de erro do Firebase Authentication
    const errorMessages = {
        "auth/invalid-email":
            "O endereço de email introduzido não é válido.",

        "auth/user-not-found":
            "Email ou palavra-passe incorretos.",

        "auth/wrong-password":
            "Email ou palavra-passe incorretos.",

        "auth/invalid-credential":
            "Email ou palavra-passe incorretos.",

        "auth/user-disabled":
            "Esta conta foi desativada. Contacta o administrador.",

        "auth/too-many-requests":
            "Demasiadas tentativas de login. Tenta novamente mais tarde.",

        "auth/network-request-failed":
            "Erro de ligação. Verifica a tua ligação à Internet.",

        "auth/missing-password":
            "Introduz a tua palavra-passe.",

        "auth/operation-not-allowed":
            "O login por email e palavra-passe não está ativado."
    };

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        // Limpar mensagens de erro anteriores
        errorElement.textContent = "";
        errorElement.style.display = "none";

        // Desativar o botão durante a autenticação
        loginBtn.disabled = true;
        loginBtn.textContent = "A entrar...";

        try {
            // Tentar autenticar o utilizador
            await signInWithEmailAndPassword(
                auth,
                email,
                password
            );

            // Login bem-sucedido: abrir a dashboard
            window.location.href = "./dashboard.html";

        } catch (error) {
            // Mostrar a mensagem correspondente ao erro
            errorElement.textContent =
                errorMessages[error.code] ||
                "Não foi possível iniciar sessão. Verifica os teus dados e tenta novamente.";

            errorElement.style.display = "block";

            console.error(
                "Erro de autenticação:",
                error.code,
                error.message
            );

            // Voltar a permitir uma tentativa de login
            loginBtn.disabled = false;
            loginBtn.textContent = "Entrar na plataforma";
        }
    });
