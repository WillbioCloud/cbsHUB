# Versionamento

O projeto segue SemVer. Enquanto não houver aprovação de produção, as versões são candidatos de revisão no formato `2.0.0-rc.N`.

- `package.json` e a entrada raiz do `package-lock.json` devem ter a mesma versão. Mudar a versão não deve atualizar dependências.
- Cada correção no candidato avança o `rc` (rc.7 -> rc.8). Nunca reutilize o identificador de um artefato já distribuído.
- Criar um candidato não autoriza publicar release, criar tag estável nem alterar a `main`.
- A versão **2.0.0 estável** depende da matriz física de testes (dois e depois 3–6 dispositivos reais), da revisão de segurança/dependências e da autorização do mantenedor.
- A direção de produto "3.0" não equivale a uma release 3.0.0 validada.

Versão atual: **2.0.0-rc.7** (correção de estabilidade de áudio; instalador Windows ainda não validado).
