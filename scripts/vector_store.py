import ollama

models = ollama.list()

print("Installed models:")
for model in models.models:
    print(model.model)