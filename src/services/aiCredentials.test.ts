import assert from "node:assert/strict";
import test from "node:test";

test("site route sends no browser credential and only uses the current origin", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = globalThis.fetch;
  const requests: { url: string; authorization: string | null }[] = [];

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { protocol: "https:", origin: "https://datamorph.example" },
    },
  });
  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("authorization"),
    });

    return new Response(
      JSON.stringify(
        String(input).endsWith("/models")
          ? { data: [{ id: "api-model" }] }
          : { choices: [{ message: { content: "ok" } }] },
      ),
      {
        headers: { "content-type": "application/json" },
      },
    );
  };

  // Select the browser transport after installing the mock, before the SDK loads.
  await import("openai/shims/web");
  const { OpenAIService } = await import("./openAIService");
  const { useOpenAIConfigStore } = await import(
    "../store/useOpenAIConfigStore"
  );
  const { storage } = await import("../lib/indexedDBStore");
  const originalSave = storage.setItem;
  storage.setItem = async (_key, value) => value;
  const originalState = useOpenAIConfigStore.getState();

  try {
    useOpenAIConfigStore.setState({ routeType: "default" });
    const service = OpenAIService.createInstance();

    await service.chat({ messages: [{ role: "user", content: "test" }] });
    assert.deepEqual(requests, [
      { url: "/api/ai/v1/models", authorization: null },
      {
        url: "https://datamorph.example/api/ai/v1/chat/completions",
        authorization: null,
      },
    ]);

    // The chosen service route must win over the store's currently selected route.
    useOpenAIConfigStore.setState({
      routeType: "default",
      customRoute: {
        ...originalState.customRoute,
        apiKey: "user-test-key",
        proxyUrl: "https://private.example/v1",
      },
    });
    service.updateConfig({ routeType: "custom", model: "test" });
    await service.chat({ model: "test", messages: [] });
    assert.deepEqual(requests[2], {
      url: "https://private.example/v1/chat/completions",
      authorization: "Bearer user-test-key",
    });

    for (const routeType of [
      "default",
      "utools",
      "ssooai",
      "custom",
    ] as const) {
      useOpenAIConfigStore.setState({
        routeType,
        ssooaiRoute: { ...originalState.ssooaiRoute, apiKey: "" },
        customRoute: { ...originalState.customRoute, apiKey: "" },
      });
      assert.equal(useOpenAIConfigStore.getState().getCurrentApiKey(), "");
    }
  } finally {
    storage.setItem = originalSave;
    globalThis.fetch = originalFetch;
    if (originalWindow)
      Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    useOpenAIConfigStore.setState(originalState, true);
  }
});

test("custom route accepts a full chat/completions URL and a manual model when /models is missing", async () => {
  const originalFetch = globalThis.fetch;
  const requests: { url: string; model?: string }[] = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({
      url,
      model: init?.body ? JSON.parse(String(init.body)).model : undefined,
    });
    if (url.endsWith("/models"))
      return new Response("not found", { status: 404 });

    return new Response(
      JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
      { headers: { "content-type": "application/json" } },
    );
  };

  await import("openai/shims/web");
  const { OpenAIService } = await import("./openAIService");
  const { useOpenAIConfigStore } = await import(
    "../store/useOpenAIConfigStore"
  );
  const { storage } = await import("../lib/indexedDBStore");
  const originalSave = storage.setItem;
  storage.setItem = async (_key, value) => value;
  const originalState = useOpenAIConfigStore.getState();
  const gateway = "http://llm.example/llm/qwen/v1";

  try {
    useOpenAIConfigStore.setState({
      routeType: "custom",
      customRoute: {
        ...originalState.customRoute,
        apiKey: "user-test-key",
        proxyUrl: `${gateway}/chat/completions/`,
        manualModel: " qwen ",
        model: "",
      },
    });

    await useOpenAIConfigStore.getState().fetchModels("custom");
    assert.deepEqual(useOpenAIConfigStore.getState().customModels, [
      { value: "qwen", label: "qwen" },
    ]);
    assert.equal(useOpenAIConfigStore.getState().customRoute.model, "qwen");

    assert.deepEqual(requests, [
      { url: `${gateway}/models`, model: undefined },
    ]);

    // SDK 在首次加载时已绑定上一个用例的 fetch，这里直接检查客户端的基础地址
    const service = OpenAIService.createInstance();
    assert.equal(service.config.model, "qwen");
    assert.equal(
      (service as unknown as { openai: { baseURL: string } }).openai.baseURL,
      gateway,
    );

    useOpenAIConfigStore.setState({
      customRoute: {
        ...useOpenAIConfigStore.getState().customRoute,
        manualModel: "",
      },
    });
    await assert.rejects(
      useOpenAIConfigStore.getState().fetchModels("custom"),
      /手动填写模型名称/,
    );
  } finally {
    storage.setItem = originalSave;
    globalThis.fetch = originalFetch;
    useOpenAIConfigStore.setState(originalState, true);
  }
});
