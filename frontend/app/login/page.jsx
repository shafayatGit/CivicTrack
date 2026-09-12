import LoginForm from "@/components/Modules/Auth/LoginForm";

export const metadata = {
  title: "Sign in",
  description: "Sign in to your account",
};

const LoginPage = () => {
  return (
    <main className="flex min-h-svh items-center justify-center p-4 sm:p-6 md:p-8">
      <LoginForm />
    </main>
  );
};

export default LoginPage;
