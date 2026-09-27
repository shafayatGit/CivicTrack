import RegisterForm from "@/components/Modules/Auth/RegisterForm";
import AuthLayout from "@/components/Modules/Layout/AuthLayout";

export const metadata = {
  title: "Create an account",
  description: "Create a new account",
};

const RegisterPage = () => (
  <AuthLayout>
    <RegisterForm />
  </AuthLayout>
);

export default RegisterPage;
