import LoginForm from "@/components/Modules/Auth/LoginForm";
import AuthLayout from "@/components/Modules/Layout/AuthLayout";

export const metadata = {
  title: "Sign in",
  description: "Sign in to your account",
};

const LoginPage = () => (
  <AuthLayout>
    <LoginForm />
  </AuthLayout>
);

export default LoginPage;
