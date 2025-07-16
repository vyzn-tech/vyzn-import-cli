import json
import pandas as pd
from datetime import datetime

def load_hatching_pattern_mapping():
    """Load the hatching pattern mapping CSV file."""
    hatching_pattern_mapping_file_path = '/Users/mtschudi/Documents/GitHub/vyzn/parse_lesosai_components/KBOB_hatchingpattern_mapping.csv'
    return pd.read_csv(hatching_pattern_mapping_file_path)

def get_hatching_pattern(kbob_ref, mapping_df):
    """
    Get hatching pattern based on the KBOB REF.
    Uses the hatching pattern mapping CSV to find the appropriate pattern.
    """
    if kbob_ref is None:
        return None
    
    # Look for the KBOB REF in the mapping
    pattern_row = mapping_df[mapping_df['KBOB REF'] == kbob_ref]
    
    if not pattern_row.empty:
        hatching_pattern = pattern_row['Hatching Pattern'].iloc[0]
        # Return None if the hatching pattern is empty or NaN
        if pd.isna(hatching_pattern) or hatching_pattern == '':
            return None
        return hatching_pattern
    
    return None

def enrich_json_with_hatching_patterns(input_json_path, output_json_path):
    """
    Enrich an existing JSON file with hatching patterns from the CSV mapping.
    """
    # Load the hatching pattern mapping
    hatching_pattern_mapping_df = load_hatching_pattern_mapping()
    
    # Load the input JSON file
    with open(input_json_path, 'r', encoding='utf-8') as file:
        data = json.load(file)
    
    # Counter for statistics
    updated_count = 0
    not_found_count = 0
    
    # Process each product in the JSON
    for product_id, product_data in data['products'].items():
        # Check if the product has a KBOB REF attribute
        if 'attributes' in product_data and 'KBOB REF' in product_data['attributes']:
            kbob_ref = product_data['attributes']['KBOB REF']
            hatching_pattern = get_hatching_pattern(kbob_ref, hatching_pattern_mapping_df)
            
            if hatching_pattern is not None:
                product_data['hatchingPattern'] = hatching_pattern
                updated_count += 1
                print(f"Updated {product_id}: {hatching_pattern}")
            else:
                not_found_count += 1
                print(f"No hatching pattern found for {product_id} (KBOB REF: {kbob_ref})")
        else:
            print(f"No KBOB REF found for {product_id}")
    
    # Update the export timestamp
    data['exportTimestamp'] = datetime.utcnow().isoformat() + 'Z'
    
    # Save the enriched JSON
    with open(output_json_path, 'w', encoding='utf-8') as file:
        json.dump(data, file, indent=2, ensure_ascii=False)
    
    print(f"\nEnrichment completed!")
    print(f"Updated {updated_count} products with hatching patterns")
    print(f"Could not find hatching patterns for {not_found_count} products")
    print(f"Output saved to: {output_json_path}")

if __name__ == "__main__":
    # Define input and output paths
    input_json_path = '/Users/mtschudi/Documents/GitHub/vyzn/vyzn-import-cli/data/kbob/kbob_2022_v5_mat.json'
    output_json_path = '/Users/mtschudi/Documents/GitHub/vyzn/vyzn-import-cli/data/kbob/kbob_2022_v5_mat.json'
    
    # Run the enrichment
    enrich_json_with_hatching_patterns(input_json_path, output_json_path) 