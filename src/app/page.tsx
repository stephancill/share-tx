"use server";

import { redirect } from "next/navigation";

async function App() {
  return redirect("/encode");
}

export default App;
