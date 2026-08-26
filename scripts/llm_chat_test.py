from langchain_ollama import ChatOllama
import os

llm=ChatOllama(model="mistral:latest",
               temperature=0.3,
               num_ctx=2048,
               num_predictions=250)
messages=[{"role":"system","content":"You are a helpful assistant for the Sphinx website. Answer the user's question briefly."},
          {"role":"user","content":"What is Sphinx?"}]
response=llm.invoke(messages)
print(response.content)
