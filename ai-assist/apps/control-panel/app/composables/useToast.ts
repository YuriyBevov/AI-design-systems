import type { Ref } from "vue";

export type ToastType = "success" | "error";

export type ToastNotification = {
  id: string;
  type: ToastType;
  text: string;
};

type ToastMessage = {
  type: ToastType;
  text: string;
};

let toastSequence = 0;

export const useToast = () => {
  const notifications = useState<ToastNotification[]>("toast-notifications", () => []);

  const dismiss = (id: string): void => {
    notifications.value = notifications.value.filter((notification) => notification.id !== id);
  };

  const show = (text: string, type: ToastType = "success"): string => {
    const id = `${Date.now()}-${(toastSequence += 1)}`;
    notifications.value = [...notifications.value, { id, type, text }].slice(-5);
    return id;
  };

  return {
    notifications,
    dismiss,
    show,
    success: (text: string) => show(text, "success"),
    error: (text: string) => show(text, "error"),
  };
};

export const useToastMessage = <TMessage extends ToastMessage | string | null>(
  message: Ref<TMessage>,
  defaultType: ToastType = "error",
): void => {
  const toast = useToast();

  watch(
    message,
    (value) => {
      if (!value) return;
      if (typeof value === "string") {
        toast.show(value, defaultType);
        return;
      }
      toast.show(value.text, value.type);
    },
    { flush: "sync" },
  );
};
