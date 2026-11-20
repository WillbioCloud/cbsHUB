import { useSettingsDrafts } from "../lib/settingsDrafts";
import { AvatarCrop } from "./AvatarCrop";
import {
  Children,
  isValidElement,
  useEffect,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  CalendarDays,
  ExternalLink,
  Pencil,
  Shield,
  UserRound,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { Switch } from "../components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "../components/ui/dropdown-menu";
import { contrast } from "../studio/theme";
import { useProfiles } from "./ProfileProvider";
import { useHubStore } from "../store/useHubStore";
import {
  publicProfile,
  PRESENCES,
  type UserProfile,
  type PublicProfile,
  type Presence,
} from "./model";
import { profileImage } from "./repository";

function ProfileSelect({
  children,
  value,
  onChange,
  ...props
}: {
  children: ReactNode;
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  "aria-label": string;
}) {
  const options = Children.toArray(children).filter(
    isValidElement<{ value: string; children: string }>,
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between"
          aria-label={props["aria-label"]}
        >
          {options.find((o) => o.props.value === value)?.props.children}{" "}
          <span aria-hidden="true">⌄</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => onChange({ target: { value: v } })}
        >
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.props.value} value={o.props.value}>
              {o.props.children}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function ProfileCard({
  profile: p,
  full = false,
}: {
  profile: PublicProfile;
  full?: boolean;
}) {
  const safeLinks = p.links.filter((link) => {
    try {
      const url = new URL(link);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  });
  const style: CSSProperties = {
    "--profile-color": p.appearance.color,
    background:
      p.appearance.theme === "light"
        ? "#f8fafc"
        : p.appearance.theme === "dark"
          ? "#171b21"
          : p.appearance.background,
    color:
      p.appearance.theme === "light"
        ? "#182331"
        : p.appearance.theme === "dark"
          ? "#edf1f5"
          : contrast("#ffffff", p.appearance.background) >=
              contrast("#111111", p.appearance.background)
            ? "#ffffff"
            : "#111111",
    borderColor: p.appearance.color,
  } as CSSProperties;
  return (
    <article
      className={`profile-card profile-card-${p.appearance.card}`}
      style={style}
    >
      <div
        className="profile-banner"
        style={{
          background: p.appearance.useGradient
            ? `linear-gradient(135deg,${p.appearance.color},${p.appearance.gradient})`
            : p.appearance.color,
        }}
      >
        {p.banner && <img src={p.banner} alt="Banner do perfil" />}
      </div>
      <div className="profile-card-content">
        <div
          className={`profile-picture profile-border-${p.appearance.border}`}
          style={{ borderColor: p.appearance.color }}
        >
          {p.avatar ? (
            <img src={p.avatar} alt={`Avatar de ${p.displayName}`} />
          ) : (
            <UserRound aria-hidden="true" />
          )}
        </div>
        <h2>{p.displayName}</h2>
        <p className="profile-handle">@{p.username}</p>
        <p className="profile-presence" data-presence={p.presence}>
          <span />
          {PRESENCES[p.presence]}
        </p>
        {(p.status || p.emoji) && (
          <p className="profile-status">
            {p.emoji} {p.status}
          </p>
        )}
        {p.bio && (
          <section>
            <h3>Sobre mim</h3>
            <p className={full ? "" : "profile-bio-short"}>{p.bio}</p>
          </section>
        )}
        {safeLinks.length > 0 && (
          <section>
            <h3>Links</h3>
            {safeLinks.map((link) => (
              <a
                key={link}
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="profile-link"
              >
                <ExternalLink className="size-3.5" />
                {new URL(link).hostname}
              </a>
            ))}
          </section>
        )}
        {p.createdAt !== null && (
          <p className="profile-date">
            <CalendarDays className="size-3.5" />
            Perfil local criado em{" "}
            {new Date(p.createdAt).toLocaleDateString("pt-BR")}
          </p>
        )}
      </div>
    </article>
  );
}
const privacyLabels = {
  showBio: "Compartilhar biografia",
  showLinks: "Compartilhar links",
  showCreatedAt: "Compartilhar data de criação do perfil",
  shareImages: "Compartilhar avatar e banner",
  allowCalls: "Permitir chamadas de participantes",
  allowReactions: "Permitir reações às minhas mensagens",
} as const;
export function ProfileDialog({ embedded = false }: { embedded?: boolean }) {
  const profiles = useProfiles();
  const participants = useHubStore((s) => s.participants);
  const selected = Object.values(participants).find(
    (p) => p.clientId === profiles.selected,
  );
  const self =
    embedded ||
    profiles.selected === "self" ||
    profiles.selected === profiles.own.ownerId;
  const [draft, setDraft] = useState<UserProfile>(
      structuredClone(profiles.own),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (embedded || profiles.editing) {
      setDraft(structuredClone(profiles.own));
      setError("");
    }
  }, [embedded || profiles.editing, profiles.own]);
  const patch = (p: Partial<UserProfile>) =>
    setDraft((current) => ({ ...current, ...p }));
  const blocked = !!selected && profiles.blocked.includes(selected.clientId);
  const displayed = self
    ? publicProfile({
        ...profiles.own,
        privacy: {
          ...profiles.own.privacy,
          visibility: "room",
          showBio: true,
          showLinks: true,
          showCreatedAt: true,
          shareImages: true,
        },
      })
    : blocked
      ? null
      : selected?.profile;
  const preview = publicProfile({
    ...draft,
    privacy: {
      ...draft.privacy,
      visibility: "room",
      showBio: true,
      showLinks: true,
      showCreatedAt: true,
      shareImages: true,
    },
  })!;
  const [cropFile, setCropFile] = useState<File | null>(null);
  useEffect(() => {
    if (!embedded) return;
    useSettingsDrafts.setState({
      profile:
        JSON.stringify(draft) !== JSON.stringify(profiles.own) || !!cropFile,
    });
    return () => useSettingsDrafts.setState({ profile: false });
  }, [embedded, draft, profiles.own, cropFile]);
  async function upload(file: File | undefined, kind: "avatar" | "banner") {
    if (!file) return;
    if (kind === "avatar") {
      setCropFile(file);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const image = await profileImage(file, kind);
      setDraft((current) => ({ ...current, [kind]: image }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const content = (
    <>
      {embedded ? (
        <>
          <h3 className="font-semibold">Editar perfil</h3>
          <p className="text-xs text-muted-foreground">
            As alterações só são aplicadas ao salvar.
          </p>
        </>
      ) : (
        <>
          {" "}
          <DialogTitle>
            {embedded || profiles.editing
              ? "Editar perfil"
              : profiles.full
                ? "Perfil completo"
                : "Perfil"}
          </DialogTitle>
          <DialogDescription>
            {embedded || profiles.editing
              ? "Personalize sua identidade. As alterações só são aplicadas ao salvar."
              : "Identidade compartilhada com participantes desta sala."}
          </DialogDescription>
        </>
      )}{" "}
      {embedded || profiles.editing ? (
        <>
          <div className="profile-editor-grid">
            <div>
              <Tabs defaultValue="identity">
                <TabsList
                  aria-label="Seções do perfil"
                  className="w-full grid grid-cols-3"
                >
                  <TabsTrigger value="identity">Identidade</TabsTrigger>
                  <TabsTrigger value="style">Aparência</TabsTrigger>
                  <TabsTrigger value="privacy">Privacidade</TabsTrigger>
                </TabsList>
                <TabsContent value="identity" className="profile-fields">
                  <label>
                    Nome de exibição
                    <Input
                      aria-label="Nome de exibição"
                      value={draft.displayName}
                      maxLength={40}
                      onChange={(e) => patch({ displayName: e.target.value })}
                    />
                  </label>
                  <label>
                    Nome de usuário
                    <Input
                      aria-label="Nome de usuário"
                      value={draft.username}
                      maxLength={24}
                      onChange={(e) =>
                        patch({ username: e.target.value.toLowerCase() })
                      }
                    />
                  </label>
                  <p className="profile-help">
                    Disponibilidade verificada entre participantes conhecidos
                    nesta sala. Reserva global depende de um servidor de contas.
                  </p>
                  <label>
                    Biografia
                    <textarea
                      aria-label="Biografia"
                      value={draft.bio}
                      maxLength={500}
                      onChange={(e) => patch({ bio: e.target.value })}
                    />
                  </label>
                  <label>
                    Status personalizado
                    <Input
                      aria-label="Status personalizado"
                      value={draft.status}
                      maxLength={100}
                      onChange={(e) => patch({ status: e.target.value })}
                    />
                  </label>
                  <label>
                    Emoji de status
                    <Input
                      aria-label="Emoji de status"
                      value={draft.emoji}
                      maxLength={16}
                      onChange={(e) => patch({ emoji: e.target.value })}
                    />
                  </label>
                  <label>
                    Presença
                    <ProfileSelect
                      aria-label="Presença"
                      value={draft.presence}
                      onChange={(e) =>
                        patch({ presence: e.target.value as Presence })
                      }
                    >
                      {Object.entries(PRESENCES).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </ProfileSelect>
                  </label>
                  <p className="profile-help">
                    Invisível exibe Offline no perfil. Participar de uma sala
                    ainda revela sua presença na conexão P2P.
                  </p>
                  <label>
                    Links HTTPS (até 3, um por linha)
                    <textarea
                      aria-label="Links do perfil"
                      value={draft.links.join("\n")}
                      onChange={(e) =>
                        patch({
                          links: e.target.value.split("\n").filter(Boolean),
                        })
                      }
                    />
                  </label>
                  {(["avatar", "banner"] as const).map((kind) => (
                    <div className="profile-upload" key={kind}>
                      <label>
                        {kind === "avatar"
                          ? "Avatar (original até 20 MB)"
                          : "Banner (até 2 MB)"}
                        <Input
                          type="file"
                          aria-label={`Upload de ${kind}`}
                          accept="image/png,image/jpeg,image/webp"
                          disabled={busy}
                          onChange={(e) => {
                            void upload(e.target.files?.[0], kind);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!draft[kind]}
                        onClick={() => patch({ [kind]: "" })}
                      >
                        Remover {kind}
                      </Button>
                    </div>
                  ))}
                  <p className="profile-help">
                    PNG, JPEG ou WebP. Imagens são recortadas e reencodadas
                    localmente; não há upload para servidor.
                  </p>
                </TabsContent>
                <TabsContent value="style" className="profile-fields">
                  {(["color", "background", "gradient"] as const).map(
                    (key, i) => (
                      <label key={key}>
                        {
                          [
                            "Cor principal",
                            "Fundo do cartão",
                            "Segunda cor do gradiente",
                          ][i]
                        }
                        <div className="flex gap-2">
                          <input
                            aria-label={`Seletor ${key}`}
                            type="color"
                            value={draft.appearance[key]}
                            onChange={(e) =>
                              patch({
                                appearance: {
                                  ...draft.appearance,
                                  [key]: e.target.value,
                                },
                              })
                            }
                          />
                          <Input
                            aria-label={`HEX ${key}`}
                            value={draft.appearance[key]}
                            maxLength={7}
                            onChange={(e) => {
                              if (/^#[a-f0-9]{6}$/i.test(e.target.value))
                                patch({
                                  appearance: {
                                    ...draft.appearance,
                                    [key]: e.target.value,
                                  },
                                });
                            }}
                          />
                        </div>
                      </label>
                    ),
                  )}
                  <label className="profile-switch">
                    Usar gradiente
                    <Switch
                      aria-label="Usar gradiente"
                      checked={draft.appearance.useGradient}
                      onCheckedChange={(useGradient) =>
                        patch({
                          appearance: { ...draft.appearance, useGradient },
                        })
                      }
                    />
                  </label>
                  <label>
                    Borda do avatar
                    <ProfileSelect
                      aria-label="Borda do avatar"
                      value={draft.appearance.border}
                      onChange={(e) =>
                        patch({
                          appearance: {
                            ...draft.appearance,
                            border: e.target
                              .value as UserProfile["appearance"]["border"],
                          },
                        })
                      }
                    >
                      <option value="none">Sem borda</option>
                      <option value="ring">Anel</option>
                      <option value="double">Dupla</option>
                    </ProfileSelect>
                  </label>
                  <label>
                    Estilo do cartão
                    <ProfileSelect
                      aria-label="Estilo do cartão"
                      value={draft.appearance.card}
                      onChange={(e) =>
                        patch({
                          appearance: {
                            ...draft.appearance,
                            card: e.target
                              .value as UserProfile["appearance"]["card"],
                          },
                        })
                      }
                    >
                      <option value="soft">Suave</option>
                      <option value="outlined">Contornado</option>
                      <option value="glass">Translúcido</option>
                    </ProfileSelect>
                  </label>
                  <label>
                    Tema do perfil
                    <ProfileSelect
                      aria-label="Tema do perfil"
                      value={draft.appearance.theme}
                      onChange={(e) =>
                        patch({
                          appearance: {
                            ...draft.appearance,
                            theme: e.target
                              .value as UserProfile["appearance"]["theme"],
                          },
                        })
                      }
                    >
                      <option value="inherit">Tema do aplicativo</option>
                      <option value="dark">Escuro</option>
                      <option value="light">Claro</option>
                    </ProfileSelect>
                  </label>
                </TabsContent>
                <TabsContent value="privacy" className="profile-fields">
                  <label>
                    Visibilidade do perfil
                    <ProfileSelect
                      aria-label="Visibilidade do perfil"
                      value={draft.privacy.visibility}
                      onChange={(e) =>
                        patch({
                          privacy: {
                            ...draft.privacy,
                            visibility: e.target.value as "room" | "private",
                          },
                        })
                      }
                    >
                      <option value="room">Participantes da sala</option>
                      <option value="private">Somente eu</option>
                    </ProfileSelect>
                  </label>
                  {Object.entries(privacyLabels).map(([key, label]) => (
                    <label className="profile-switch" key={key}>
                      {label}
                      <Switch
                        aria-label={label}
                        checked={
                          draft.privacy[key as keyof typeof privacyLabels]
                        }
                        onCheckedChange={(v) =>
                          patch({ privacy: { ...draft.privacy, [key]: v } })
                        }
                      />
                    </label>
                  ))}
                  <p className="profile-help">
                    Nome de exibição, mensagens e mídia de uma sala não são
                    privados. Dados já compartilhados não podem ser apagados de
                    outros dispositivos. Permissões e bloqueios são locais; sem
                    conta autenticada, identidades podem ser recriadas.
                  </p>
                  <h3 className="text-sm font-semibold">
                    Bloqueados neste dispositivo
                  </h3>
                  {profiles.blocked.length === 0 ? (
                    <p className="profile-help">
                      Nenhuma identidade bloqueada.
                    </p>
                  ) : (
                    profiles.blocked.map((id) => (
                      <div className="flex gap-2 items-center" key={id}>
                        <span className="truncate text-xs">
                          {Object.values(participants).find(
                            (p) => p.clientId === id,
                          )?.nickname || `Identidade ${id.slice(0, 8)}`}
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => profiles.block(id, false)}
                        >
                          Desbloquear
                        </Button>
                      </div>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </div>
            <aside>
              <h3 className="text-sm font-medium mb-3">Pré-visualização</h3>
              <ProfileCard profile={preview} full />
              <p className="profile-help">
                A prévia mostra seus campos completos. A aba Privacidade
                controla o que é enviado.
              </p>
            </aside>
          </div>
          <div role="alert" className="profile-error">
            {error || profiles.error}
          </div>
          <footer className="profile-actions">
            <Button
              variant="ghost"
              onClick={() =>
                embedded
                  ? setDraft(structuredClone(profiles.own))
                  : profiles.close()
              }
            >
              Cancelar
            </Button>
            <Button disabled={busy} onClick={() => profiles.save(draft)}>
              Salvar perfil
            </Button>
          </footer>
        </>
      ) : (
        <>
          {displayed ? (
            <ProfileCard profile={displayed} full={profiles.full} />
          ) : (
            <div className="profile-private">
              <Shield className="size-8" />
              <h2>
                {blocked
                  ? "Perfil bloqueado"
                  : selected?.nickname || "Perfil indisponível"}
              </h2>
              <p>
                {blocked
                  ? "Você ocultou esta identidade neste dispositivo."
                  : "Este participante não compartilhou um perfil ou está desconectado."}
              </p>
            </div>
          )}
          <div role="alert" className="profile-error">
            {profiles.error}
          </div>
          <footer className="profile-actions">
            {self ? (
              <Button onClick={profiles.edit}>
                <Pencil className="size-4 mr-2" />
                Editar perfil
              </Button>
            ) : (
              selected && (
                <Button
                  variant={blocked ? "secondary" : "destructive"}
                  onClick={() => profiles.block(selected.clientId, !blocked)}
                >
                  {blocked ? "Desbloquear" : "Bloquear usuário"}
                </Button>
              )
            )}
            {!profiles.full && displayed && (
              <Button variant="outline" onClick={profiles.expand}>
                Ver perfil completo
              </Button>
            )}
          </footer>
        </>
      )}
      <AvatarCrop
        embedded={embedded}
        file={cropFile}
        onClose={() => setCropFile(null)}
        onSave={(image) =>
          setDraft((current) => ({ ...current, avatar: image }))
        }
      />
    </>
  );
  return embedded ? (
    <section className="profile-embedded" aria-label="Editor de perfil">
      {content}
    </section>
  ) : (
    <Dialog
      open={profiles.selected !== null}
      onOpenChange={(open) => {
        if (!open) profiles.close();
      }}
    >
      <DialogContent
        className={`profile-window ${profiles.full ? "profile-full" : ""}`}
      >
        {content}
      </DialogContent>
    </Dialog>
  );
}
