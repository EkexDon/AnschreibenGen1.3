import asyncio
from generator import generate_cover_letter
from compiler import compile_latex

async def main():
    print("Testing generate_cover_letter and compile_latex...")
    try:
        res = await generate_cover_letter("Max Mustermann, Software Engineer", "Suche Python Entwickler. Bitte bewerben.")
        print("LaTeX generated successfully. Compiling...")
        pdf_path = compile_latex(res)
        print(f"Success! PDF generated at: {pdf_path}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
