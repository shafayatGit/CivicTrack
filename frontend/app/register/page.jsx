import RegisterForm from "@/components/Modules/Auth/RegisterForm";

export const metadata = {
  title: "Create an account",
  description: "Create a new account",
};

const RegisterPage = () => {
  return (
    <main className="flex min-h-svh items-center justify-center p-4 sm:p-6 md:p-8">
      <RegisterForm />
    </main>
  );
};

export default RegisterPage;
